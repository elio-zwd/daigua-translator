#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Heuristic MCU C/C++ symbol extractor (Python stdlib only).

Outputs factual intermediate JSON for AI-assisted review. It is not a compiler:
complex declarations/preprocessor-dependent code are recorded in uncertain.json.
"""
import argparse
import bisect
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# Preserve Chinese diagnostics in Windows shells using a legacy code page.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='replace')

SOURCE_SUFFIXES = {".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hh", ".hxx"}
HEADER_SUFFIXES = {".h", ".hpp", ".hh", ".hxx"}
IDENT = r"[A-Za-z_][A-Za-z0-9_]*"
TRIVIAL = {"i", "j", "k", "tmp", "temp", "n", "idx", "ret"}
FUNC = re.compile(
    r"(?m)^[ \t]*(?P<signature>(?:(?:static|extern|inline|constexpr|const|volatile|__weak|"
    r"__inline|__STATIC_INLINE)\s+)*"
    r"(?:[A-Za-z_]\w*(?:::\w+)?(?:\s*<[^(){};]+>)?(?:\s+|\s*[*&]\s*))+"
    r"(?P<name>[A-Za-z_]\w*)\s*\((?P<args>[^(){};]*)\)\s*(?:const\s*)?)"
    r"(?P<end>\{|;)",
    re.MULTILINE,
)
VARIABLE = re.compile(
    r"^[ \t]*(?P<decl>(?:(?:static|extern|volatile|const|register|unsigned|signed)\s+)*"
    r"(?:[A-Za-z_]\w*(?:::\w+)?(?:\s*<[^;{}()]+>)?(?:\s+|\s*[*&]\s*))+"
    r"(?P<name>[A-Za-z_]\w*)(?:\s*\[[^\]]*\])?\s*(?:=\s*[^;]*)?);[ \t]*$"
)
ENUM = re.compile(
    r"\btypedef\s+enum(?:\s+[A-Za-z_]\w*)?\s*\{(?P<body>[^{}]*)\}\s*"
    r"(?P<name>[A-Za-z_]\w*)\s*;", re.DOTALL,
)
TYPEDEF = re.compile(
    r"(?m)^[ \t]*typedef\s+(?!enum\b|struct\s*\{|union\s*\{)"
    r"(?P<decl>[^;{}()]+?)\s+(?P<name>[A-Za-z_]\w*)\s*;",
)
COMMENT = re.compile(r"/\*\*[\s\S]*?\*/")
PARAM = re.compile(r"[@\\]param(?:\[[^\]]+\])?\s+(" + IDENT + r")\s*:?\s+([^\r\n@\\*]+)")
BRIEF = re.compile(r"[@\\]brief\s+([^\r\n@\\*]+)")
RETURN = re.compile(r"[@\\](?:return|retval)\s+([^\r\n@\\*]+)")


def mask_non_code(text):
    """Blank comments, strings and chars while preserving offsets and newlines."""
    result = list(text)
    i = 0
    state = "code"
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "code":
            if ch == "/" and nxt == "/":
                state = "line"
                result[i] = result[i + 1] = " "
                i += 2
                continue
            if ch == "/" and nxt == "*":
                state = "block"
                result[i] = result[i + 1] = " "
                i += 2
                continue
            if ch in ('"', "'"):
                state = ch
                result[i] = " "
        elif state == "line":
            if ch == "\n":
                state = "code"
            else:
                result[i] = " "
        elif state == "block":
            if ch == "*" and nxt == "/":
                result[i] = result[i + 1] = " "
                i += 2
                state = "code"
                continue
            if ch != "\n":
                result[i] = " "
        else:
            if ch == "\\" and i + 1 < len(text):
                result[i] = " "
                if text[i + 1] != "\n":
                    result[i + 1] = " "
                i += 2
                continue
            if ch == state:
                state = "code"
            if ch != "\n":
                result[i] = " "
        i += 1
    # Macro bodies cannot participate in structural brace matching.
    masked = "".join(result)
    return re.sub(r"(?m)^[ \t]*#(?:[^\n\\]|\\\n)*[^\n]*", lambda m: re.sub(r"[^\n]", " ", m.group()), masked)


def line_index_and_depth(masked):
    starts = [0]
    depths = [0]
    depth = 0
    for i, ch in enumerate(masked):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth = max(depth - 1, 0)
        if ch == "\n" and i + 1 < len(masked):
            starts.append(i + 1)
            depths.append(depth)
    return starts, depths


def comment_before(text, offset):
    prefix = text[:offset]
    comments = list(COMMENT.finditer(prefix))
    if not comments or prefix[comments[-1].end():].strip():
        return ""
    return comments[-1].group()


def doxygen(text):
    def one(regex):
        m = regex.search(text)
        return m.group(1).strip() if m else ""
    return {
        "brief": one(BRIEF),
        "return": one(RETURN),
        "params": {name: desc.strip() for name, desc in PARAM.findall(text)},
    }


def parse_parameters(raw, doc):
    params = []
    if not raw.strip() or raw.strip() == "void":
        return params
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        found = re.search(r"(" + IDENT + r")\s*(?:\[[^\]]*\])?$", token)
        name = found.group(1) if found else token
        params.append({
            "name": name, "type": token,
            "description_zh": doc["params"].get(name, ""),
        })
    return params


def brace_block(masked, original, start):
    depth = 0
    for pos in range(start, len(masked)):
        if masked[pos] == "{":
            depth += 1
        elif masked[pos] == "}":
            depth -= 1
            if depth == 0:
                return original[start:pos + 1], True
    return original[start:], False


def multiple_declarators(text):
    depth = 0
    for char in text:
        if char in "({[": depth += 1
        elif char in ")}]": depth -= 1
        elif char == "," and depth == 0: return True
    return False


class MCUExtractor:
    def __init__(self, proj_root, include_drivers=False, include_freertos=False, include_locals=False):
        self.proj_root = Path(proj_root).resolve()
        self.include_drivers = include_drivers
        self.include_freertos = include_freertos
        self.include_locals = include_locals
        self.functions = []
        self.variables = []
        self.macros = []
        self.uncertain = []
        self.processed_files = []

    def should_ignore_file(self, file):
        file = Path(file)
        if file.suffix.lower() not in SOURCE_SUFFIXES:
            return True
        path = file.as_posix().lower()
        parts = {p.lower() for p in file.parts}
        if parts.intersection({"build", "debug", "release", "objects", "listings", ".git"}):
            return True
        if "common/vendor/cmsis/core" in path or "at32f435_437.h" in path:
            return True
        if not self.include_freertos and "common/vendor/freertos" in path:
            return True
        if not self.include_drivers and "common/vendor/drivers" in path:
            return True
        return False

    def parse_uvprojx(self, proj):
        root = ET.parse(proj).getroot()
        project_dir = proj.parent
        source = []
        include = []
        for element in root.iter():
            tag = element.tag.rsplit("}", 1)[-1]
            if not element.text:
                continue
            if tag == "FilePath":
                path = (project_dir / element.text.strip().replace("\\", "/")).resolve()
                if path.is_file() and not self.should_ignore_file(path):
                    source.append(path)
            elif tag == "IncludePath":
                for part in element.text.split(";"):
                    if part.strip():
                        directory = (project_dir / part.strip().replace("\\", "/")).resolve()
                        if directory.is_dir():
                            include.append(directory)
        return source, include

    def collect_source_files(self, proj_file=None, src_dir=None):
        files = set()
        if proj_file:
            if not proj_file.is_file():
                raise FileNotFoundError("Keil 工程文件不存在: " + str(proj_file))
            source, include = self.parse_uvprojx(proj_file)
            files.update(source)
            # Headers can be nested; include .hpp/.hh as well.
            for directory in include:
                files.update(
                    f.resolve() for f in directory.rglob("*")
                    if f.is_file() and f.suffix.lower() in HEADER_SUFFIXES
                    and not self.should_ignore_file(f)
                )
            # Local headers next to source files even if not in IncludePath.
            for file in source:
                files.update(
                    f.resolve() for f in file.parent.iterdir()
                    if f.is_file() and f.suffix.lower() in HEADER_SUFFIXES
                    and not self.should_ignore_file(f)
                )
        if src_dir:
            if not src_dir.exists():
                raise FileNotFoundError("源码路径不存在: " + str(src_dir))
            candidates = [src_dir] if src_dir.is_file() else src_dir.rglob("*")
            files.update(f.resolve() for f in candidates if f.is_file() and not self.should_ignore_file(f))
        ordered = sorted(files, key=lambda path: path.as_posix())
        # Validate every file before processing/export, including shared headers.
        for file in ordered:
            self.relative(file)
        return ordered

    def relative(self, path):
        try:
            return Path(path).resolve().relative_to(self.proj_root).as_posix()
        except ValueError as error:
            raise ValueError("源码位于根目录外，请用 --root 指定包含工程和共享源码的目录: " + str(path)) from error

    def add_uncertain(self, path, line, reason, sample=""):
        self.uncertain.append({
            "source": {"file": path, "line": line},
            "reason": reason,
            "snippet": sample.strip()[:200],
        })

    @staticmethod
    def make_entry(name, kind, declaration, scope, source, **extras):
        value = {
            "symbol": name, "kind": kind, "name_zh": "",
            "description_zh": "", "declaration": declaration.strip(),
            "parameters": [], "returns_zh": "", "scope": scope,
            "source": source, "uncertainty": "",
        }
        value.update(extras)
        return value

    def process_file(self, path):
        relative = self.relative(path)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = path.read_text(encoding="utf-8", errors="replace")
            self.add_uncertain(relative, 1, "源码编码不是 UTF-8，替换字符需复核")
        except OSError as error:
            self.add_uncertain(relative, 1, "读取失败: " + str(error))
            return
        self.processed_files.append(relative)
        masked = mask_non_code(text)
        starts, depths = line_index_and_depth(masked)
        def line_at(index):
            return bisect.bisect_right(starts, index)
        def depth_at(index):
            return depths[bisect.bisect_right(starts, index) - 1]

        lines = text.splitlines()
        masked_lines = masked.splitlines()
        self._macros(lines, relative)
        for match in ENUM.finditer(masked):
            if depth_at(match.start()) != 0:
                continue
            name = match.group("name")
            line = line_at(match.start())
            self.macros.append(self.make_entry(
                name, "enum", "typedef enum { ... } " + name, relative,
                {"file": relative, "line": line},
                description_zh="枚举类型定义",
            ))
            for item in match.group("body").split(","):
                ident = re.match(r"\s*(" + IDENT + r")", item)
                if ident:
                    self.macros.append(self.make_entry(
                        ident.group(1), "enum", item.strip(), relative + "::" + name,
                        {"file": relative, "line": line},
                        description_zh="枚举 " + name + " 的取值常量",
                    ))
        for match in TYPEDEF.finditer(masked):
            if depth_at(match.start()) == 0:
                self.macros.append(self.make_entry(
                    match.group("name"), "typedef", text[match.start():match.end()],
                    relative, {"file": relative, "line": line_at(match.start())},
                ))

        function_ranges = []
        for match in FUNC.finditer(masked):
            if depth_at(match.start()) != 0:
                continue
            name = match.group("name")
            signature = text[match.start("signature"):match.end("signature")].strip()
            if name in {"if", "while", "for", "switch", "catch", "sizeof"}:
                continue
            comment = comment_before(text, match.start())
            doc = doxygen(comment)
            definition = match.group("end") == "{"
            source = {"file": relative, "line": line_at(match.start())}
            body = ""
            if definition:
                body, closed = brace_block(masked, text, match.start("end"))
                function_ranges.append((match.start("end"), match.start("end") + len(body), name))
                if not closed:
                    self.add_uncertain(relative, source["line"], "函数大括号未闭合", signature)
                if len(body.splitlines()) > 50:
                    body = "\n".join(body.splitlines()[:50]) + "\n// [截断，请回看源码]"
            entry = self.make_entry(
                name, "function", signature, relative, source,
                name_zh=doc["brief"], description_zh=doc["brief"],
                parameters=parse_parameters(text[match.start("args"):match.end("args")], doc),
                returns_zh=doc["return"], body=body,
                existing_comment=comment[:500],
            )
            entry["_definition"] = definition
            entry["_static"] = bool(re.search(r"\bstatic\b", signature))
            self.functions.append(entry)

        # Parse one-statement, file-scope variables; skip declarations inside bodies.
        for i, raw in enumerate(lines):
            line = i + 1
            if i >= len(depths) or depths[i] != 0:
                continue
            original = raw.strip()
            if not original or original.startswith("#"):
                continue
            masked_line = masked_lines[i].strip()
            if not masked_line or "(" in masked_line or ")" in masked_line:
                continue
            if masked_line.startswith(("typedef ", "using ", "struct ", "enum ", "union ")):
                continue
            found = VARIABLE.match(masked_line)
            if found:
                name = found.group("name")
                if name.lower() in TRIVIAL:
                    continue
                previous_comment = lines[i - 1].strip() if i else ""
                comment = previous_comment if previous_comment.startswith("//") else comment_before(
                    text, starts[i]
                )
                self.variables.append(self.make_entry(
                    name, "variable", original.rstrip(";"), relative,
                    {"file": relative, "line": line},
                    existing_comment=comment[:500],
                    type=original[:found.start("name")].strip(),
                ))
            elif (re.match(r"^(?:static|extern|volatile|const|unsigned|signed|\w+)\s+\w+", masked_line)
                  and "=" in masked_line and ";" not in masked_line):
                self.add_uncertain(relative, line, "可能存在跨行初始化的全局变量", original)

        if self.include_locals:
            self._locals(text, masked, starts, relative, function_ranges)

        if path.suffix.lower() in {".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx"}:
            if re.search(r"\b(?:namespace|template)\b", masked):
                self.add_uncertain(relative, 1, "包含 namespace/template；复杂 C++ 语法需人工复核")
        if re.search(r"(?m)^[ \t]*#[ \t]*(?:if|elif)\b", text):
            self.add_uncertain(relative, 1, "含条件编译；未解析宏配置，提取内容需按目标构建复核")
        if re.search(r"\(\s*\*\s*" + IDENT + r"\s*\)\s*\(", masked):
            self.add_uncertain(relative, 1, "包含函数指针声明；正则提取可能遗漏")

    def _locals(self, text, masked, starts, relative, functions):
        """Conservative single-line declaration candidates, not an AST parser."""
        lines = text.splitlines()
        for begin, end, function in functions:
            for index in range(bisect.bisect_right(starts, begin) - 1,
                               min(bisect.bisect_right(starts, end), len(lines))):
                offset = starts[index]
                segment_start = max(offset, begin + 1)
                segment_end = min(offset + len(lines[index]), end - 1)
                raw = masked[segment_start:segment_end]
                # Split at semicolons, but never mistake a control/return expression for a type.
                for statement in re.finditer(r"[^;{}]+;", raw):
                    declaration = statement.group().strip()
                    if not declaration or re.match(r"^(?:return|goto|break|continue|if|for|while|switch|case|else|throw|delete|typedef|using)\b", declaration):
                        continue
                    # Calls/casts are allowed in the initializer, never in the declarator.
                    declarator = declaration.split("=", 1)[0]
                    found = VARIABLE.match(declaration)
                    if found and not re.search(r"[(),]", declarator) and not multiple_declarators(declaration):
                        name = found.group("name")
                        if name.lower() in TRIVIAL:
                            continue
                        start = segment_start + statement.start()
                        start += len(statement.group()) - len(statement.group().lstrip())
                        original = text[start:segment_start + statement.end()].strip().rstrip(";")
                        line = index + 1
                        self.variables.append(self.make_entry(
                            name, "variable", original,
                            f"{relative}::{function}:L{line}:C{start - offset + 1}",
                            {"file": relative, "line": line},
                            type=declaration[:found.start("name")].strip(),
                            function=function, local=True,
                            context="\n".join(lines[max(0, index - 2):index + 3]),
                        ))
                    elif re.match(r"^(?:static\s+|const\s+|volatile\s+)*(?:[A-Za-z_]\w*)\s+[*&]?[A-Za-z_]\w*", declaration):
                        self.add_uncertain(relative, index + 1, "复杂局部声明需人工复核", declaration)

    def _macros(self, lines, relative):
        index = 0
        while index < len(lines):
            raw = lines[index].strip()
            line_no = index + 1
            if raw.startswith("#define "):
                parts = [raw]
                while parts[-1].endswith("\\") and index + 1 < len(lines):
                    index += 1
                    parts.append(lines[index].strip())
                full = " ".join(x.rstrip("\\").strip() for x in parts)
                match = re.match(r"#define\s+(" + IDENT + r")(\([^)]*\))?(?:\s+.*)?$", full)
                if match:
                    name = match.group(1)
                    if not (name.startswith("__") and name.endswith("_H")):
                        self.macros.append(self.make_entry(
                            name, "macro", full, relative,
                            {"file": relative, "line": line_no},
                        ))
                else:
                    self.add_uncertain(relative, line_no, "无法解析宏定义", full)
            index += 1

    def deduplicate(self):
        """Prefer function bodies to header prototypes; preserve file-local statics."""
        chosen = {}
        for entry in self.functions:
            param_types = []
            for p in entry["parameters"]:
                token = p["type"]
                # Ignore a trailing argument name when comparing header/definition.
                token = re.sub(r"\b" + re.escape(p["name"]) + r"\s*$", "", token).strip()
                param_types.append(re.sub(r"\s+", "", token))
            key = (
                entry["symbol"], tuple(param_types),
                entry["scope"] if re.search(r"\bstatic\b", entry["declaration"]) else "",
            )
            existing = chosen.get(key)
            if existing is None:
                chosen[key] = entry
                continue
            preferred = entry if entry.get("body") and not existing.get("body") else existing
            extra = existing if preferred is entry else entry
            for field in ("name_zh", "description_zh", "returns_zh", "existing_comment"):
                if not preferred[field] and extra[field]:
                    preferred[field] = extra[field]
            for idx, p in enumerate(preferred["parameters"]):
                if idx < len(extra["parameters"]) and not p["description_zh"]:
                    p["description_zh"] = extra["parameters"][idx]["description_zh"]
            chosen[key] = preferred
        self.functions = list(chosen.values())
        for entry in self.functions:
            entry.pop("_definition", None)
            entry.pop("_static", None)

        # Merge extern declarations only when one compatible external definition exists.
        def variable_key(entry):
            decl = entry["declaration"].split("=", 1)[0]
            return entry["symbol"], re.sub(r"\s+", "", re.sub(r"\bextern\b", "", decl))
        definitions = {}
        for entry in self.variables:
            if entry.get("local") or re.match(r"(?:static|extern)\b", entry["declaration"]):
                continue
            definitions.setdefault(variable_key(entry), []).append(entry)
        variables = []
        for entry in self.variables:
            if not entry.get("local") and re.match(r"extern\b", entry["declaration"]) and "=" not in entry["declaration"]:
                matches = definitions.get(variable_key(entry), [])
                if len(matches) == 1:
                    if not matches[0].get("existing_comment"):
                        matches[0]["existing_comment"] = entry.get("existing_comment", "")
                    continue
            variables.append(entry)
        self.variables = variables

    def export(self, out_dir):
        self.deduplicate()
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, values in (
            ("functions", self.functions), ("variables", self.variables),
            ("macros", self.macros), ("uncertain", self.uncertain),
        ):
            (out_dir / (name + ".json")).write_text(
                json.dumps(values, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        summary = (
            f"文件: {len(self.processed_files)}\n函数: {len(self.functions)}\n"
            f"变量: {len(self.variables)}\n宏/枚举/类型: {len(self.macros)}\n"
            f"待确认: {len(self.uncertain)}\n\n" + "\n".join(self.processed_files) + "\n"
        )
        (out_dir / "extract_summary.txt").write_text(summary, encoding="utf-8")
        print(summary)


def main():
    parser = argparse.ArgumentParser(description="MCU C/C++ 工程源码事实提取")
    parser.add_argument("--proj", help="Keil .uvprojx 工程")
    parser.add_argument("--src", help="源码目录或单个文件")
    parser.add_argument("--out", required=True, help="输出目录")
    parser.add_argument("--root", help="来源相对路径根目录，需包含工程与共享源码")
    parser.add_argument("--include-locals", action="store_true", help="提取局部变量候选供 AI 和人工筛选")
    parser.add_argument("--include-drivers", action="store_true")
    parser.add_argument("--include-freertos", action="store_true")
    args = parser.parse_args()
    if not args.proj and not args.src:
        parser.error("需要提供 --proj 或 --src")
    proj = Path(args.proj).resolve() if args.proj else None
    src = Path(args.src).resolve() if args.src else None
    root = proj.parent if proj else (src.parent if src and src.is_file() else src)
    if root and root.name.lower() == "mdk_v5":
        root = root.parent
    if args.root:
        root = Path(args.root).resolve()
    extractor = MCUExtractor(root or Path.cwd(), args.include_drivers, args.include_freertos, args.include_locals)
    try:
        if not extractor.proj_root.is_dir():
            raise ValueError("--root 必须是存在的目录")
        files = extractor.collect_source_files(proj, src)
    except (OSError, ValueError, ET.ParseError) as error:
        print("[ERROR] " + str(error), file=sys.stderr)
        return 1
    if not files:
        print("[ERROR] 未找到支持的 C/C++ 源文件", file=sys.stderr)
        return 1
    try:
        for file in files:
            extractor.process_file(file)
        extractor.export(Path(args.out).resolve())
    except (OSError, ValueError) as error:
        print("[ERROR] " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
