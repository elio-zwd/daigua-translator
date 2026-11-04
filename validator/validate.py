#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate and export MCU knowledge-pack JSON without silent partial success."""
import argparse
import json
import re
import sys
import tempfile
from pathlib import Path, PureWindowsPath

# GitHub Actions and some Windows shells default to a non-Unicode console code page.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='replace')

VALID_KINDS = {"function", "variable", "macro", "enum", "typedef"}
SYMBOL_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
OPTIONAL_TEXT = ("description_zh", "declaration", "returns_zh", "scope", "uncertainty")


def check_text(value, field, errors, required=False):
    if not isinstance(value, str):
        errors.append(field + " 必须是字符串")
        return ""
    if required and not value.strip():
        errors.append(field + " 不能为空")
    return value


def check_source(source, location, root, errors):
    if not isinstance(source, dict):
        errors.append(location + ": source 必须是对象")
        return
    file_value = check_text(source.get("file"), location + ".source.file", errors, True)
    if "project" in source:
        check_text(source["project"], location + ".source.project", errors)
    if "line" in source:
        line = source["line"]
        # JSON numbers such as 1 and 1.0 must agree with Number.isSafeInteger in JS.
        if (type(line) not in (int, float) or not 0 < line <= 9007199254740991 or int(line) != line):
            errors.append(location + ".source.line 必须是正整数")
    if not file_value:
        return
    # Reject Windows drive paths even when running validation on POSIX.
    path = Path(file_value.replace("\\", "/"))
    if path.is_absolute() or PureWindowsPath(file_value).root or PureWindowsPath(file_value).drive:
        errors.append(location + ": source.file 必须是相对于 --src 的路径")
        return
    if ".." in path.parts:
        errors.append(location + ": source.file 不允许越过源码根目录")
        return
    if re.search(r'[\x00-\x1f<>:"|?*]', file_value):
        errors.append(location + ": source.file 含有 Windows 非法路径字符")
        return
    if root is not None:
        try:
            resolved = (root / path).resolve()
            if not resolved.is_relative_to(root):
                errors.append(location + ": source.file 不允许越过源码根目录")
            elif not resolved.is_file():
                errors.append(location + ": 来源文件不存在: " + file_value)
        except (OSError, ValueError, RuntimeError) as error:
            errors.append(location + ": 无法检查来源路径: " + str(error))


def check_parameters(parameters, location, errors):
    if not isinstance(parameters, list):
        errors.append(location + ".parameters 必须是数组")
        return
    seen = set()
    for index, param in enumerate(parameters, 1):
        label = f"{location}.parameters[{index}]"
        if not isinstance(param, dict):
            errors.append(label + " 必须是对象")
            continue
        name = check_text(param.get("name"), label + ".name", errors, True)
        if "description_zh" in param:
            check_text(param["description_zh"], label + ".description_zh", errors)
        if "type" in param:
            check_text(param["type"], label + ".type", errors)
        if name and name in seen:
            errors.append(label + ": 重复参数名 " + name)
        seen.add(name)


def validate_data(data, src_root=None):
    """Return (errors, warnings) for one parsed JSON document."""
    errors, warnings = [], []
    if not isinstance(data, dict):
        return ["知识包根节点必须是对象"], warnings

    for field in ("name", "version"):
        check_text(data.get(field), "根节点." + field, errors, True)
    if "source_version" in data:
        check_text(data["source_version"], "根节点.source_version", errors)
    if "description" in data:
        check_text(data["description"], "根节点.description", errors)
    entries = data.get("entries")
    if not isinstance(entries, list):
        errors.append("根节点.entries 必须是数组")
        return errors, warnings

    try:
        root = Path(src_root).resolve() if src_root is not None else None
    except (OSError, ValueError, RuntimeError) as error:
        return ["--src 路径无效: " + str(error)], warnings
    if root is not None and not root.is_dir():
        errors.append("--src 必须是存在的源码目录")
        return errors, warnings

    duplicates = {}
    for index, entry in enumerate(entries, 1):
        label = f"词条 #{index}"
        if not isinstance(entry, dict):
            errors.append(label + " 必须是对象")
            continue
        symbol = check_text(entry.get("symbol"), label + ".symbol", errors, True)
        kind = check_text(entry.get("kind"), label + ".kind", errors, True)
        check_text(entry.get("name_zh"), label + ".name_zh", errors, True)
        if symbol and not SYMBOL_RE.fullmatch(symbol):
            errors.append(label + ": symbol 不是合法的 C/C++ 标识符")
        if kind and kind not in VALID_KINDS:
            errors.append(label + ": 非法 kind " + kind)
        for field in OPTIONAL_TEXT:
            if field in entry:
                check_text(entry[field], label + "." + field, errors)
        scope = entry.get("scope", "")
        if isinstance(scope, str) and symbol:
            key = (scope, symbol)
            if key in duplicates:
                errors.append(
                    f"{label}: 重复词条 ({scope}, {symbol})，首次出现于词条 #{duplicates[key]}"
                )
            else:
                duplicates[key] = index
        check_source(entry.get("source"), label, root, errors)
        if "parameters" in entry:
            check_parameters(entry["parameters"], label, errors)
        elif kind == "function":
            warnings.append(label + ": 缺少 parameters 数组")
        if isinstance(entry.get("uncertainty"), str) and entry["uncertainty"].strip():
            warnings.append(label + ": 含有待确认说明，建议人工复核")
    return errors, warnings


def validate_pack(pack_path, src_root=None, out_path=None):
    try:
        with open(pack_path, encoding="utf-8-sig") as handle:
            data = json.load(handle)
    except (OSError, ValueError, UnicodeError) as error:
        print("[ERROR] 无法读取知识包: " + str(error))
        return False
    errors, warnings = validate_data(data, src_root)
    print(f"校验: {pack_path}; 错误 {len(errors)} 项，警告 {len(warnings)} 项")
    for message in errors:
        print("[ERROR] " + message)
    for message in warnings:
        print("[WARN] " + message)
    if errors:
        print("[FAIL] 拒绝导出未通过校验的知识包")
        return False
    if out_path is not None:
        try:
            target = Path(out_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            # Write atomically in the destination directory.
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix=target.name + ".", suffix=".tmp", delete=False) as handle:
                temp = Path(handle.name)
            try:
                temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                temp.replace(target)
            finally:
                if temp.exists():
                    temp.unlink()
        except (OSError, ValueError) as error:
            print("[ERROR] 导出失败: " + str(error))
            return False
        print("[OK] 导出: " + str(out_path))
    else:
        print("[OK] 知识包通过校验")
    return True


def main():
    parser = argparse.ArgumentParser(description="校验并导出 MCU 知识包")
    parser.add_argument("--pack", required=True, help="知识包 JSON")
    parser.add_argument("--src", help="真实源码根目录，用于检查源文件")
    parser.add_argument("--out", help="成功后导出标准 JSON")
    args = parser.parse_args()
    return 0 if validate_pack(args.pack, args.src, args.out) else 1


if __name__ == "__main__":
    sys.exit(main())
