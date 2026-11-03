#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
extract.py
呆瓜翻译器 - MCU 源码符号提取工具

用于从 MCU C/C++ 工程中提取函数、变量、宏、枚举与类型定义，
输出标准化中间 JSON 文件，供后续 AI 生成中文释义知识包使用。
"""

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# Windows 终端输出编码保护
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# 忽略的局部临时变量名列表
TRIVIAL_VAR_NAMES = {
    "i", "j", "k", "n", "m", "tmp", "temp", "buf", "buffer",
    "len", "length", "ret", "err", "res", "result", "idx",
    "index", "cnt", "count", "val", "value", "ch", "ptr", "p"
}

# 常见 C 关键字与修饰符
MODIFIERS = {
    "static", "__weak", "volatile", "inline", "__inline",
    "__STATIC_INLINE", "extern", "const", "register", "auto"
}


class MCUExtractor:
    def __init__(self, proj_root: str, include_drivers: bool = False, include_freertos: bool = False):
        self.proj_root = Path(proj_root).resolve()
        self.include_drivers = include_drivers
        self.include_freertos = include_freertos

        self.functions: List[Dict] = []
        self.variables: List[Dict] = []
        self.macros: List[Dict] = []
        self.uncertain: List[Dict] = []

        self.processed_files: List[str] = []

    def should_ignore_file(self, file_path: Path) -> bool:
        """判断是否忽略某文件（如汇编、构建目录、第三方内核等）"""
        rel = file_path.as_posix().lower()

        # 扩展名过滤
        if file_path.suffix.lower() in [".s", ".asm", ".o", ".axf", ".hex", ".map", ".lst", ".d", ".crf"]:
            return True

        # 构建目录过滤
        if "mdk_v5/objects" in rel or "mdk_v5/listings" in rel or "/build/" in rel or "/debug/" in rel:
            return True

        # FreeRTOS 核心过滤（默认跳过第三方核心实现）
        if not self.include_freertos and "common/vendor/freertos" in rel:
            return True

        # CMSIS 核心定义过滤
        if "common/vendor/cmsis/core" in rel:
            return True
        if "at32f435_437.h" in rel:  # 50KB 寄存器宏
            return True

        # 厂商驱动过滤
        if not self.include_drivers and "common/vendor/drivers" in rel:
            return True

        return False

    def parse_uvprojx(self, uvprojx_path: Path) -> Tuple[List[Path], List[Path]]:
        """从 Keil .uvprojx 解析参与编译的文件与包含目录"""
        c_files: List[Path] = []
        include_dirs: List[Path] = []

        proj_dir = uvprojx_path.parent

        try:
            tree = ET.parse(uvprojx_path)
            root = tree.getroot()

            # 1. 查找 FilePath
            for elem in root.iter("FilePath"):
                if elem.text:
                    raw_path = elem.text.strip().replace("\\", "/")
                    full_path = (proj_dir / raw_path).resolve()
                    if full_path.suffix.lower() in [".c", ".cpp"]:
                        if not self.should_ignore_file(full_path) and full_path.exists():
                            c_files.append(full_path)

            # 2. 查找 IncludePath
            for elem in root.iter("IncludePath"):
                if elem.text:
                    paths = elem.text.strip().split(";")
                    for p in paths:
                        p = p.strip().replace("\\", "/")
                        if p:
                            inc_dir = (proj_dir / p).resolve()
                            if inc_dir.exists() and inc_dir.is_dir():
                                include_dirs.append(inc_dir)
        except Exception as e:
            print(f"[WARN] 解析 uvprojx 文件失败: {e}")

        return c_files, include_dirs

    def collect_source_files(self, proj_file: Optional[Path], src_dir: Optional[Path]) -> List[Path]:
        """收集待分析的 C/H 源文件"""
        files_set: Set[Path] = set()

        if proj_file and proj_file.exists():
            c_files, inc_dirs = self.parse_uvprojx(proj_file)
            files_set.update(c_files)

            # 收集 include_dirs 下的 .h
            for idir in inc_dirs:
                if self.should_ignore_file(idir):
                    continue
                for h_file in idir.glob("*.h"):
                    if not self.should_ignore_file(h_file):
                        files_set.add(h_file.resolve())

        if src_dir and src_dir.exists():
            for ext in ["*.c", "*.h"]:
                for f in src_dir.rglob(ext):
                    if not self.should_ignore_file(f):
                        files_set.add(f.resolve())

        # 按路径排序确保稳定
        sorted_files = sorted(list(files_set), key=lambda p: str(p))
        return sorted_files

    def extract_doxygen(self, comment_text: str) -> Dict[str, str]:
        """提取 Doxygen 注释中的 brief、param、retval"""
        res = {"brief": "", "params": {}, "return": ""}
        if not comment_text:
            return res

        brief_match = re.search(r'@brief\s+([^\n@*]+)', comment_text)
        if brief_match:
            res["brief"] = brief_match.group(1).strip()

        param_matches = re.findall(r'@param\s+([a-zA-Z0-9_]+)\s*:\s*([^\n@*]+)', comment_text)
        for p_name, p_desc in param_matches:
            res["params"][p_name.strip()] = p_desc.strip()

        ret_match = re.search(r'@(?:retval|return)\s+([^\n@*]+)', comment_text)
        if ret_match:
            res["return"] = ret_match.group(1).strip()

        return res

    def get_rel_path(self, abs_path: Path) -> str:
        """获取相对于工程根目录的显示路径"""
        try:
            return abs_path.relative_to(self.proj_root).as_posix()
        except ValueError:
            return abs_path.name

    def process_file(self, file_path: Path):
        """分析单个源码文件"""
        rel_path = self.get_rel_path(file_path)
        self.processed_files.append(rel_path)

        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception as e:
            print(f"[WARN] 无法读取文件 {rel_path}: {e}")
            return

        lines = content.splitlines()

        # 1. 提取宏定义与枚举
        self._extract_macros_and_enums(content, lines, rel_path)

        # 2. 提取函数与顶层变量
        if file_path.suffix.lower() == ".c":
            self._extract_c_functions_and_variables(content, lines, rel_path)
        elif file_path.suffix.lower() == ".h":
            self._extract_h_declarations(content, lines, rel_path)

    def _extract_macros_and_enums(self, content: str, lines: List[str], rel_path: str):
        """提取 #define 宏及 typedef enum/struct"""
        # 1. 提取多行拼接后的 #define
        i = 0
        total = len(lines)
        while i < total:
            line = lines[i].strip()
            line_no = i + 1
            if line.startswith("#define"):
                macro_lines = [line]
                while macro_lines[-1].endswith("\\") and i + 1 < total:
                    i += 1
                    macro_lines.append(lines[i].strip())
                macro_full = " ".join([l.rstrip("\\").strip() for l in macro_lines])

                # 匹配 #define SYMBOL[(args)] [value]
                m = re.match(r'^#define\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\(([^)]*)\))?(?:\s+(.*))?$', macro_full)
                if m:
                    sym = m.group(1)
                    # 过滤 include guard (如 __AT32F435_437_GPIO_H 等)
                    if not (sym.startswith("__") and sym.endswith("_H")):
                        args = m.group(2)
                        val = m.group(3) or ""
                        params = []
                        if args:
                            params = [{"name": a.strip(), "description_zh": ""} for a in args.split(",") if a.strip()]

                        self.macros.append({
                            "symbol": sym,
                            "kind": "macro",
                            "name_zh": "",
                            "description_zh": "",
                            "declaration": macro_full[:120],
                            "parameters": params,
                            "returns_zh": "",
                            "scope": os.path.basename(rel_path),
                            "source": {"file": rel_path, "line": line_no},
                            "uncertainty": ""
                        })
            i += 1

        # 2. 提取 typedef enum
        enum_pattern = re.compile(r'typedef\s+enum(?:\s+[a-zA-Z0-9_]+)?\s*\{([^}]+)\}\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*;', re.DOTALL)
        for m in enum_pattern.finditer(content):
            enum_body = m.group(1)
            enum_name = m.group(2)
            # 计算行号
            line_no = content[:m.start()].count("\n") + 1

            self.macros.append({
                "symbol": enum_name,
                "kind": "enum",
                "name_zh": "",
                "description_zh": "枚举类型定义",
                "declaration": f"typedef enum {{ ... }} {enum_name};",
                "parameters": [],
                "returns_zh": "",
                "scope": os.path.basename(rel_path),
                "source": {"file": rel_path, "line": line_no},
                "uncertainty": ""
            })

            # 同时提取枚举项
            for item in enum_body.split(","):
                item_clean = item.strip()
                if item_clean:
                    item_name = item_clean.split("=")[0].strip()
                    if re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', item_name):
                        self.macros.append({
                            "symbol": item_name,
                            "kind": "enum",
                            "name_zh": "",
                            "description_zh": f"枚举 {enum_name} 的取值常量",
                            "declaration": item_clean,
                            "parameters": [],
                            "returns_zh": "",
                            "scope": enum_name,
                            "source": {"file": rel_path, "line": line_no},
                            "uncertainty": ""
                        })

    def _extract_c_functions_and_variables(self, content: str, lines: List[str], rel_path: str):
        """分析 .c 文件，提取函数体与顶层变量"""
        # 函数定义正则表达式
        func_regex = re.compile(
            r'^(?:(?:static|__weak|volatile|inline|__inline|__STATIC_INLINE)\s+)*'
            r'([a-zA-Z_][a-zA-Z0-9_\s\*]+?)\s+'  # 返回类型
            r'([a-zA-Z_][a-zA-Z0-9_]*)\s*'        # 函数名
            r'\(([^)]*)\)\s*'                     # 参数
            r'\{',                                # 开花括号
            re.MULTILINE
        )

        for match in func_regex.finditer(content):
            ret_type = match.group(1).strip()
            func_name = match.group(2).strip()
            param_str = match.group(3).strip()
            start_pos = match.start()
            line_no = content[:start_pos].count("\n") + 1

            # 过滤不是函数的 C 语句误判
            if func_name in {"if", "for", "while", "switch"}:
                continue

            # 1. 查找前置 Doxygen 注释
            pre_text = content[:start_pos]
            dox_info = {"brief": "", "params": {}, "return": ""}
            comment_match = re.search(r'/\*\*[\s\S]*?\*/\s*$', pre_text)
            existing_comment = ""
            if comment_match:
                existing_comment = comment_match.group(0).strip()
                dox_info = self.extract_doxygen(existing_comment)

            # 2. 提取参数
            parameters = []
            if param_str and param_str != "void":
                for p in param_str.split(","):
                    p_clean = p.strip()
                    if not p_clean:
                        continue
                    # 提取参数名
                    p_m = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)$', p_clean)
                    p_name = p_m.group(1) if p_m else p_clean
                    p_desc = dox_info["params"].get(p_name, "")
                    parameters.append({
                        "name": p_name,
                        "type": p_clean,
                        "description_zh": p_desc
                    })

            # 3. 提取函数实现体（大括号配对）
            brace_start = match.end() - 1
            body_text = self._extract_brace_block(content, brace_start)
            body_lines = body_text.splitlines()
            if len(body_lines) > 50:
                body_truncated = "\n".join(body_lines[:50]) + "\n// [截断，完整实现请查看源码]"
            else:
                body_truncated = body_text

            # 4. 函数签名
            declaration = f"{ret_type} {func_name}({param_str})"

            self.functions.append({
                "symbol": func_name,
                "kind": "function",
                "name_zh": dox_info["brief"] if dox_info["brief"] else "",
                "description_zh": dox_info["brief"] if dox_info["brief"] else "",
                "declaration": declaration,
                "parameters": parameters,
                "returns_zh": dox_info["return"] if dox_info["return"] else "",
                "scope": os.path.basename(rel_path),
                "body": body_truncated,
                "existing_comment": existing_comment[:200] if existing_comment else "",
                "source": {"file": rel_path, "line": line_no},
                "uncertainty": ""
            })

        # 5. 提取顶层静态/全局变量
        self._extract_global_variables(lines, rel_path)

    def _extract_global_variables(self, lines: List[str], rel_path: str):
        """提取顶层静态与全局变量"""
        in_function = False
        brace_depth = 0

        for line_idx, raw_line in enumerate(lines):
            line = raw_line.strip()
            line_no = line_idx + 1

            # 跟踪括号深度，判断是否在函数体内
            brace_depth += raw_line.count("{") - raw_line.count("}")
            if brace_depth > 0:
                continue

            if not line or line.startswith("//") or line.startswith("/*") or line.startswith("#"):
                continue

            # 匹配形如: static int board_ready; 或 volatile course_fault_type course_last_fault;
            # static const uint32_t intervals[2] = {500, 1000};
            if ("static" in line or "volatile" in line or "extern" in line) and ";" in line and "(" not in line:
                var_match = re.search(r'^(?:(?:static|volatile|extern|const)\s+)+([a-zA-Z0-9_\s\*]+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\[[^\]]*\])?(?:\s*=.*)?;', line)
                if var_match:
                    v_type = var_match.group(1).strip()
                    v_name = var_match.group(2).strip()
                    if v_name.lower() not in TRIVIAL_VAR_NAMES:
                        self.variables.append({
                            "symbol": v_name,
                            "kind": "variable",
                            "name_zh": "",
                            "description_zh": "",
                            "declaration": line.rstrip(";"),
                            "parameters": [],
                            "returns_zh": "",
                            "scope": os.path.basename(rel_path),
                            "source": {"file": rel_path, "line": line_no},
                            "uncertainty": ""
                        })

    def _extract_h_declarations(self, content: str, lines: List[str], rel_path: str):
        """分析 .h 头文件中的函数原型声明"""
        decl_regex = re.compile(
            r'^(?:extern\s+)?(?:(?:static|__weak|volatile|inline|__inline|__STATIC_INLINE)\s+)*'
            r'([a-zA-Z_][a-zA-Z0-9_\s\*]+?)\s+'
            r'([a-zA-Z_][a-zA-Z0-9_]*)\s*'
            r'\(([^)]*)\)\s*;',
            re.MULTILINE
        )

        for match in decl_regex.finditer(content):
            ret_type = match.group(1).strip()
            func_name = match.group(2).strip()
            param_str = match.group(3).strip()
            start_pos = match.start()
            line_no = content[:start_pos].count("\n") + 1

            if func_name in {"if", "for", "while", "switch"}:
                continue

            pre_text = content[:start_pos]
            dox_info = {"brief": "", "params": {}, "return": ""}
            comment_match = re.search(r'/\*\*[\s\S]*?\*/\s*$', pre_text)
            existing_comment = ""
            if comment_match:
                existing_comment = comment_match.group(0).strip()
                dox_info = self.extract_doxygen(existing_comment)

            parameters = []
            if param_str and param_str != "void":
                for p in param_str.split(","):
                    p_clean = p.strip()
                    if not p_clean:
                        continue
                    p_m = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)$', p_clean)
                    p_name = p_m.group(1) if p_m else p_clean
                    p_desc = dox_info["params"].get(p_name, "")
                    parameters.append({
                        "name": p_name,
                        "type": p_clean,
                        "description_zh": p_desc
                    })

            self.functions.append({
                "symbol": func_name,
                "kind": "function",
                "name_zh": dox_info["brief"] if dox_info["brief"] else "",
                "description_zh": dox_info["brief"] if dox_info["brief"] else "",
                "declaration": f"{ret_type} {func_name}({param_str})",
                "parameters": parameters,
                "returns_zh": dox_info["return"] if dox_info["return"] else "",
                "scope": os.path.basename(rel_path),
                "body": "",
                "existing_comment": existing_comment[:200] if existing_comment else "",
                "source": {"file": rel_path, "line": line_no},
                "uncertainty": ""
            })

    def _extract_brace_block(self, content: str, start_index: int) -> str:
        """从左大括号开始截取匹配的完整大括号块"""
        depth = 0
        end_index = start_index
        for idx in range(start_index, len(content)):
            char = content[idx]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end_index = idx + 1
                    break
        return content[start_index:end_index]

    def export(self, out_dir: Path):
        """导出四个中间 JSON 文件及统计摘要"""
        out_dir.mkdir(parents=True, exist_ok=True)

        # 写入 functions.json
        with open(out_dir / "functions.json", "w", encoding="utf-8") as f:
            json.dump(self.functions, f, ensure_ascii=False, indent=2)

        # 写入 variables.json
        with open(out_dir / "variables.json", "w", encoding="utf-8") as f:
            json.dump(self.variables, f, ensure_ascii=False, indent=2)

        # 写入 macros.json
        with open(out_dir / "macros.json", "w", encoding="utf-8") as f:
            json.dump(self.macros, f, ensure_ascii=False, indent=2)

        # 写入 uncertain.json
        with open(out_dir / "uncertain.json", "w", encoding="utf-8") as f:
            json.dump(self.uncertain, f, ensure_ascii=False, indent=2)

        # 写入 extract_summary.txt
        summary_text = f"""=== 呆瓜翻译器 - MCU 源码提取摘要 ===
分析文件总数: {len(self.processed_files)}
提取函数总数: {len(self.functions)}
提取变量总数: {len(self.variables)}
提取宏与枚举: {len(self.macros)}
待确认项目数: {len(self.uncertain)}

分析的文件列表:
""" + "\n".join([f"  - {f}" for f in self.processed_files])

        with open(out_dir / "extract_summary.txt", "w", encoding="utf-8") as f:
            f.write(summary_text)

        print(f"\n[OK] 提取完成，生成成果文件位于: {out_dir}")
        print(f"  - 分析文件: {len(self.processed_files)}")
        print(f"  - 函数: {len(self.functions)}")
        print(f"  - 变量: {len(self.variables)}")
        print(f"  - 宏与枚举: {len(self.macros)}")


def main():
    parser = argparse.ArgumentParser(description="呆瓜翻译器 - MCU C/C++ 源码提取工具")
    parser.add_argument("--proj", default=None, help="Keil .uvprojx 工程文件路径")
    parser.add_argument("--src", default=None, help="源码根目录或单个源码文件路径")
    parser.add_argument("--out", required=True, help="中间文件输出目录")
    parser.add_argument("--include-drivers", action="store_true", help="是否包含第三方/厂商驱动库符号提取")
    parser.add_argument("--include-freertos", action="store_true", help="是否包含 FreeRTOS 核心代码提取")

    args = parser.parse_args()

    proj_file = Path(args.proj).resolve() if args.proj else None
    src_dir = Path(args.src).resolve() if args.src else None

    # 确定项目总根目录
    root_dir = proj_file.parent if proj_file else (src_dir if src_dir else Path.cwd())
    # 如果是在 05_createtask/mdk_v5 下，往上一层
    if "mdk_v5" in root_dir.as_posix():
        root_dir = root_dir.parent

    extractor = MCUExtractor(
        proj_root=str(root_dir),
        include_drivers=args.include_drivers,
        include_freertos=args.include_freertos
    )

    source_files = extractor.collect_source_files(proj_file, src_dir)
    if not source_files:
        print("[WARN] 未检索到符合条件的 C/H 源码文件，请检查 --proj 或 --src 路径")
        sys.exit(1)

    print(f"准备开始分析，共计 {len(source_files)} 个源文件...")
    for sf in source_files:
        extractor.process_file(sf)

    extractor.export(Path(args.out).resolve())


if __name__ == "__main__":
    main()
