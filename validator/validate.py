#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
validate.py
呆瓜翻译器 - 知识包校验与导出工具

用于检查知识包 JSON 文件的结构规范性、必填字段、符号重复性及源文件引用，
支持格式化并导出标准化知识包。
"""

import argparse
import json
import os
import sys
from collections import defaultdict

# 针对 Windows 控制台编码保护
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# 合法的符号类别
VALID_KINDS = {"function", "variable", "macro", "enum", "typedef"}


def validate_pack(pack_path: str, src_root: str = None, out_path: str = None) -> bool:
    """
    校验知识包文件
    :param pack_path: 知识包 JSON 路径
    :param src_root: 可选，源代码根目录，用于校验 source.file 是否真实存在
    :param out_path: 可选，导出标准化格式的路径
    :return: 校验是否通过（True 为成功，False 为发现致命错误）
    """
    print(f"正在校验知识包: {pack_path}")
    if not os.path.exists(pack_path):
        print(f"[错误] 知识包文件不存在: {pack_path}")
        return False

    try:
        with open(pack_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"[错误] 解析 JSON 文件失败: {e}")
        return False

    errors = []
    warnings = []

    # 1. 检查根级必填字段
    for req_field in ["name", "version", "entries"]:
        if req_field not in data:
            errors.append(f"根节点缺少必填字段: '{req_field}'")

    entries = data.get("entries", [])
    if not isinstance(entries, list):
        errors.append("根节点字段 'entries' 必须是数组列表")
        entries = []

    print(f"  包含词条总数: {len(entries)}")

    # 2. 检查词条字段与符号重复情况
    # 统计 (symbol, scope) 的出现次数
    scope_symbol_count = defaultdict(list)

    for idx, entry in enumerate(entries):
        entry_loc = f"词条 #{idx + 1}"
        if not isinstance(entry, dict):
            errors.append(f"{entry_loc} 格式非法，必须为 JSON 对象")
            continue

        symbol = entry.get("symbol", "").strip()
        kind = entry.get("kind", "").strip()
        name_zh = entry.get("name_zh", "").strip()
        source = entry.get("source")
        scope = entry.get("scope", "").strip()

        if not symbol:
            errors.append(f"{entry_loc}: 'symbol' 不能为空")
        else:
            scope_symbol_count[(scope, symbol)].append(idx + 1)

        if not kind:
            errors.append(f"{entry_loc} ({symbol}): 'kind' 不能为空")
        elif kind not in VALID_KINDS:
            warnings.append(
                f"{entry_loc} ({symbol}): 'kind'='{kind}' 不在标准类别列表 {list(VALID_KINDS)} 中"
            )

        if not name_zh:
            warnings.append(f"{entry_loc} ({symbol}): 'name_zh' 中文名称为空")

        if not source or not isinstance(source, dict):
            errors.append(f"{entry_loc} ({symbol}): 缺少 'source' 对象字段")
        else:
            file_path = source.get("file", "").strip()
            if not file_path:
                warnings.append(f"{entry_loc} ({symbol}): source.file 路径未填写")
            elif src_root:
                # 校验文件在源码目录中是否存在
                abs_file_path = os.path.normpath(os.path.join(src_root, file_path))
                if not os.path.exists(abs_file_path):
                    warnings.append(
                        f"{entry_loc} ({symbol}): 源码引用文件不存在: {file_path}"
                    )

    # 3. 重复符号检查
    for (scope, symbol), idx_list in scope_symbol_count.items():
        if len(idx_list) > 1:
            scope_desc = f"在作用域 '{scope}' 下" if scope else "在全局作用域下"
            warnings.append(
                f"符号 '{symbol}' {scope_desc} 重复出现 {len(idx_list)} 次（词条序号: {idx_list}）"
            )

    # 输出校验结果
    print("\n--- 校验结果汇总 ---")
    if errors:
        print(f"[ERROR] 发现 {len(errors)} 个致命错误:")
        for err in errors:
            print(f"  - {err}")
    else:
        print("[OK] 必填项与结构结构格式检查通过")

    if warnings:
        print(f"[WARN] 发现 {len(warnings)} 个警告项:")
        for warn in warnings:
            print(f"  - {warn}")
    else:
        print("[OK] 没有警告项")

    is_valid = len(errors) == 0

    # 4. 导出标准化知识包
    if is_valid and out_path:
        try:
            out_dir = os.path.dirname(os.path.abspath(out_path))
            if out_dir and not os.path.exists(out_dir):
                os.makedirs(out_dir, exist_ok=True)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"\n[导出] 已成功保存规范化知识包至: {out_path}")
        except Exception as e:
            print(f"\n[导出错误] 写入导出文件失败: {e}")
            return False

    return is_valid


def main():
    parser = argparse.ArgumentParser(description="呆瓜翻译器 - 知识包格式校验与导出工具")
    parser.add_argument("--pack", required=True, help="待校验的知识包 JSON 文件路径")
    parser.add_argument(
        "--src", default=None, help="可选：MCU 源码根目录，用于核对 source.file 是否真实存在"
    )
    parser.add_argument(
        "--out", default=None, help="可选：校验通过后导出规范化知识包的目标路径"
    )

    args = parser.parse_args()
    success = validate_pack(args.pack, args.src, args.out)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
