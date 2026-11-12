#!/usr/bin/env python3
"""Export explicitly supplied legacy data to a new directory. Never overwrite inputs."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from phonetics.library import read_json, validate_library
from phonetics.model import validate_terms
from validator.validate import validate_data


def read_settings(file):
    text = Path(file).read_text(encoding="utf-8-sig")
    # Preserve quoted strings while removing JSONC comments and trailing commas.
    text = re.sub(r'"(?:\\.|[^"\\])*"|//[^\r\n]*|/\*[\s\S]*?\*/',
                  lambda m: m[0] if m[0].startswith('"') else '', text)
    text = re.sub(r'"(?:\\.|[^"\\])*"|,\s*(?=[}\]])',
                  lambda m: m[0] if m[0].startswith('"') else '', text)
    return json.loads(text)


def migrate(output, terms=(), packs=(), dictionary="", projects=None):
    target = Path(output).resolve()
    if target.exists():
        raise ValueError("输出目录已存在，请选择新目录；不会覆盖原始文件")
    project_map = {str(Path(k).resolve()).casefold(): v for k, v in (projects or {}).items()}
    catalog = dict(format_version=1, word_libraries=[], naming_libraries=[], projects=[])
    if dictionary:
        catalog["dictionary_path"] = str(Path(dictionary).resolve())
    outputs, evidence, used_projects = {}, [], {}
    for index, file in enumerate(dict.fromkeys(str(Path(p).resolve()) for p in terms), 1):
        value = read_json(file)
        entries = validate_terms(value)
        for role, key, modes in [("words", "word_libraries", {"exact", "insensitive"}), ("naming", "naming_libraries", {"prefix", "identifier"})]:
            selected = [t for t in entries if t["match"] in modes]
            if not selected:
                continue
            relative = f"{role}/{index:02d}-{Path(file).stem}.json"
            outputs[relative] = dict(value, entries=selected)
            catalog[key].append(relative)
        evidence.append(dict(file=file, sha256=hashlib.sha256(Path(file).read_bytes()).hexdigest()))
    source_files = list(dict.fromkeys(str(Path(p).resolve()) for p in packs))
    source_data = {file: read_json(file) for file in source_files}
    # An enhanced package explicitly records the original hash. Prefer the last
    # enhanced copy for that batch; retain every input in migration evidence.
    enhanced = {}
    for file, value in source_data.items():
        if isinstance(value, dict):
            original_hash = value.get("pronunciation_metadata", {}).get("original_sha256") if isinstance(value.get("pronunciation_metadata", {}), dict) else None
            if original_hash:
                enhanced[original_hash] = file
    skipped = []
    for index, file in enumerate(source_files, 1):
        value = source_data[file]
        errors, _ = validate_data(value)
        if errors:
            raise ValueError(file + ": " + "; ".join(errors))
        digest = hashlib.sha256(Path(file).read_bytes()).hexdigest()
        evidence.append(dict(file=file, sha256=digest))
        metadata = value.get("pronunciation_metadata")
        batch = metadata.get("original_sha256") if isinstance(metadata, dict) else None
        preferred = enhanced.get(digest) or (enhanced.get(batch) if batch else None)
        if preferred and preferred != file and project_map.get(file.casefold(), {}).get("id") == project_map.get(preferred.casefold(), {}).get("id"):
            skipped.append(dict(file=file, reason="同批次已启用音标增强包", enabled=preferred))
            continue
        info = project_map.get(file.casefold(), {})
        project_id = info.get("id", f"legacy-{index}")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", project_id):
            raise ValueError("工程 ID 只能包含字母、数字、下划线或连字符")
        if project_id not in used_projects:
            project = dict(id=project_id, name=info.get("name", value["name"]), source_roots=info.get("source_roots", []), symbol_libraries=[])
            used_projects[project_id] = project
            catalog["projects"].append(project)
        relative = f"symbols/{project_id}/{Path(file).name}"
        if relative in outputs:
            raise ValueError("输出文件名重复：" + relative)
        outputs[relative] = value
        used_projects[project_id]["symbol_libraries"].append(relative)
    outputs["library.json"] = catalog
    outputs["migration-report.json"] = dict(inputs=evidence, not_enabled=skipped, note="原始文件保持不变；未提供源码根目录的包按跨工程参考使用。")
    target.mkdir(parents=True)
    for relative, value in outputs.items():
        file = target / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    validate_library(target)
    return catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True)
    parser.add_argument("--terms", action="append", default=[])
    parser.add_argument("--pack", action="append", default=[])
    parser.add_argument("--dictionary", default="")
    parser.add_argument("--projects", help="JSON：以原包路径为键，记录 id、name、source_roots")
    parser.add_argument("--config", help="现有 VS Code settings.json，支持 JSONC 注释和尾逗号")
    args = parser.parse_args()
    config = read_settings(args.config) if args.config else {}
    migrate(args.out, [*config.get("daiguaTranslate.technicalLibraryPaths", []), *args.terms],
            [*config.get("daiguaTranslate.packPaths", []), *args.pack],
            args.dictionary or config.get("daiguaTranslate.dictionaryPath", ""), read_json(args.projects) if args.projects else None)
    print("[OK] 独立词库已生成：" + str(Path(args.out).resolve()))


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    main()
