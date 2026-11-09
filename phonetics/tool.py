#!/usr/bin/env python3
"""Offline ECDICT indexing and additive pronunciation enrichment (Python 3.10+)."""
import argparse
import copy
import csv
import hashlib
import json
import re
import shutil
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from phonetics.model import split_identifier, find_terms, validate_terms
from validator.validate import validate_data


def read_json(file):
    return json.loads(Path(file).read_text(encoding="utf-8-sig"))


def file_hash(file):
    digest = hashlib.sha256()
    with Path(file).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(file, data):
    Path(file).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def atomic_outputs(outputs):
    """Prepare every output before replacing any; never truncate an existing file on validation failure."""
    temporary = []
    try:
        for file, data in outputs:
            target = Path(file)
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent, suffix=".tmp", delete=False) as handle:
                temp = Path(handle.name)
            temporary.append((temp, target))
            write_json(temp, data)
        for temp, target in temporary:
            temp.replace(target)
    finally:
        for temp, _ in temporary:
            temp.unlink(missing_ok=True)


def build_index(csv_file, output):
    source, target = Path(csv_file).resolve(), Path(output).resolve()
    if target.exists():
        raise ValueError("索引输出目录已存在，请选择新的目录；不会覆盖旧索引")
    license_file = source.parent / "LICENSE"
    if not license_file.is_file():
        raise ValueError("CSV 同目录缺少 LICENSE，请保留 ECDICT 原仓库许可证")
    shards = defaultdict(lambda: defaultdict(list))
    rows = accepted = 0
    source_sha256 = file_hash(source)
    with source.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not {"word", "phonetic", "translation"}.issubset(reader.fieldnames or []):
            raise ValueError("CSV 必须包含 word、phonetic、translation 列")
        for row in reader:
            rows += 1
            word = (row["word"] or "").strip()
            # Identifier segments contain ASCII letters only; phrases and punctuation cannot match.
            if not re.fullmatch(r"[A-Za-z]+", word):
                continue
            key = word.lower()
            entry = {"word": word, "translation": row["translation"] or "", "phonetic": row["phonetic"] or ""}
            if entry not in shards[key[:2]][key]:
                shards[key[:2]][key].append(entry)
                accepted += 1
    if file_hash(source) != source_sha256:
        raise ValueError("CSV 在读取过程中发生变化，请重试")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="daigua-index-", dir=target.parent) as temporary:
        stage = Path(temporary) / "index"
        stage.mkdir()
        files = {}
        for key, words in sorted(shards.items()):
            files[key] = key + ".json"
            write_json(stage / files[key], dict(sorted(words.items())))
        manifest = dict(format_version=1, source="ECDICT", source_url="https://github.com/skywind3000/ECDICT",
                        source_sha256=source_sha256, csv_rows=rows, indexed_rows=accepted,
                        filter="ASCII alphabetic identifier words", shards=files)
        write_json(stage / "manifest.json", manifest)
        shutil.copyfile(license_file, stage / "LICENSE")
        (stage / "SOURCE.txt").write_text("ECDICT: https://github.com/skywind3000/ECDICT\nCSV SHA-256: " + source_sha256 + "\nphonetic preserved verbatim; accent not individually verified.\n", encoding="utf-8")
        stage.rename(target)
    return manifest


class Dictionary:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.manifest = read_json(self.directory / "manifest.json")
        if (not isinstance(self.manifest, dict) or type(self.manifest.get("format_version")) is not int or self.manifest.get("format_version") != 1
                or not re.fullmatch(r"[a-fA-F0-9]{64}", self.manifest.get("source_sha256", ""))
                or not isinstance(self.manifest.get("shards"), dict)):
            raise ValueError("ECDICT 索引格式不兼容")
        self.cache = {}

    def find(self, token):
        key = token.lower()[:2]
        file = self.manifest["shards"].get(key)
        if file is None:
            return []
        if not isinstance(file, str) or not re.fullmatch(r"[a-z]{1,2}\.json", file):
            raise ValueError("ECDICT 分片路径无效")
        if key not in self.cache:
            self.cache[key] = read_json(self.directory / file)
        if not isinstance(self.cache[key], dict):
            raise ValueError("ECDICT 分片必须是对象")
        rows = self.cache[key].get(token.lower(), [])
        if not isinstance(rows, list) or any(not isinstance(r, dict) or any(not isinstance(r.get(k), str) for k in ("word", "translation", "phonetic")) for r in rows):
            raise ValueError("ECDICT 词条损坏")
        return rows


def enrich(pack_file, dictionary_dir, output, missing_file, extra_terms=(), supplement=None):
    original_path = Path(pack_file).resolve()
    output_path, missing_path = Path(output).resolve(), Path(missing_file).resolve()
    if any(p.suffix.lower() != '.json' for p in (output_path, missing_path)):
        raise ValueError("增强包和缺失清单必须使用 .json 文件，避免覆盖其他数据")
    input_files = [original_path, Path(dictionary_dir).resolve() / "manifest.json",
                   ROOT / "plugin/resources/technical-terms.json", *[Path(p).resolve() for p in extra_terms]]
    if supplement:
        input_files.append(Path(supplement).resolve())
    # Reject aliases, symlinks and Windows case-insensitive collisions, including index shards.
    if output_path == missing_path or any(p in input_files for p in (output_path, missing_path)):
        raise ValueError("输出不能覆盖原始包、补充文件或其他输入，且增强包和缺失清单必须使用不同路径")
    if any(p.is_relative_to(Path(dictionary_dir).resolve()) for p in (output_path, missing_path)):
        raise ValueError("输出不能写入词典索引目录")
    original_sha256 = file_hash(original_path)
    original = read_json(original_path)
    errors, _ = validate_data(original)
    if errors:
        raise ValueError("原始包校验失败：" + "；".join(errors))
    dictionary = Dictionary(dictionary_dir)
    libraries = []
    versions = []
    for file in input_files[2:]:
        libraries.append(validate_terms(read_json(file)))
        versions.append(dict(file=file.name, sha256=file_hash(file)))
    libraries.reverse()
    enhanced = copy.deepcopy(original)
    pending = {}
    ecdict_source = "ECDICT:" + dictionary.manifest["source_sha256"][:12]

    def pronunciation(symbol, context):
        segments = []
        cursor = 0
        whole = find_terms(libraries, symbol, symbol, 0, whole=True)
        for index, token in enumerate([symbol] if whole else split_identifier(symbol)):
            start = symbol.index(token, cursor)
            cursor = start + len(token)
            numeric_adjacent = (start > 0 and symbol[start - 1].isdigit()) or (cursor < len(symbol) and symbol[cursor].isdigit())
            segment = dict(text=token, reading="unknown", source="unresolved", status="pending")
            reason = "未命中词典"
            if token.isdigit():
                segment.update(source="identifier:number", status="skipped")
            else:
                matches = whole or find_terms(libraries, symbol, token, index)
                if matches:
                    distinct = {(t["reading"], t.get("phonetic", "")) for t in matches}
                    if len(distinct) == 1:
                        t = matches[0]
                        segment.update(reading=t["reading"], source=t["source"], review_status=t["review_status"],
                                       status="pending" if t["reading"] == "unknown" else "resolved")
                        if "phonetic" in t:
                            segment["phonetic"] = t["phonetic"]
                        reason = "技术库读法仍待确认"
                    else:
                        segment["source"] = "technical-library:ambiguous"
                        reason = "技术库存在多种读法"
                else:
                    rows = dictionary.find(token)
                    # Prefer a real lowercase word to a case-folded acronym record.
                    exact = [r for r in rows if r["word"] == token.lower()]
                    candidates = exact or rows
                    phonetics = {r["phonetic"] for r in candidates if r["phonetic"].strip()}
                    suspected = numeric_adjacent or len(token) == 1 or (token.isupper() and not exact) or (rows and not exact)
                    if len(phonetics) == 1 and not suspected:
                        segment.update(reading="word", phonetic=next(iter(phonetics)), source=ecdict_source, status="resolved")
                    else:
                        reason = "疑似缩写或型号" if suspected else "词典无音标或存在多种读法" if rows else reason
            if segment["status"] == "pending":
                # Deduplicate tokens, retaining all usage contexts. AI may add `symbol` to narrow a row.
                key = token
                if key not in pending:
                    pending[key] = dict(token=token, match="identifier" if whole else "exact", translation="", reading="unknown",
                                        source="external-ai:待填写", review_status="unreviewed", reason=reason, occurrences=[])
                if context not in pending[key]["occurrences"]:
                    pending[key]["occurrences"].append(context)
            segments.append(segment)
        return {"segments": segments}

    for entry in enhanced["entries"]:
        context = dict(symbol=entry["symbol"], scope=entry.get("scope", ""), source=entry["source"])
        entry["pronunciation"] = pronunciation(entry["symbol"], context)
        for parameter in entry.get("parameters", []):
            parameter["pronunciation"] = pronunciation(parameter["name"], dict(**context, parameter=parameter["name"]))
    enhanced["pronunciation_metadata"] = dict(format_version=1, original_sha256=original_sha256,
        ecdict_sha256=dictionary.manifest["source_sha256"], libraries=versions)
    errors, _ = validate_data(enhanced)
    if errors:
        raise ValueError("增强包校验失败：" + "；".join(errors))
    # Explicit invariant: only the optional extension fields may differ.
    def strip(data):
        data = copy.deepcopy(data)
        data.pop("pronunciation_metadata", None)
        for entry in data["entries"]:
            entry.pop("pronunciation", None)
            for parameter in entry.get("parameters", []):
                parameter.pop("pronunciation", None)
        return data
    if strip(enhanced) != strip(original) or file_hash(original_path) != original_sha256:
        raise ValueError("原始数据变化，拒绝导出")
    missing = dict(format_version=1, original_sha256=original_sha256, entries=list(pending.values()))
    atomic_outputs([(output_path, enhanced), (missing_path, missing)])
    return enhanced, missing


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="呆瓜离线词典与音标工具；不联网，不调用 AI，不修改原始包")
    commands = parser.add_subparsers(dest="command", required=True)
    index = commands.add_parser("index", help="从 ECDICT CSV 生成新索引目录")
    index.add_argument("--csv", required=True)
    index.add_argument("--out", required=True)
    pack = commands.add_parser("enrich", help="生成增强包及可交给外部 AI 的补充清单")
    for field in ("pack", "dictionary", "out", "missing"):
        pack.add_argument("--" + field, required=True)
    pack.add_argument("--terms", action="append", default=[], help="额外技术库 JSON，可重复，后者优先")
    pack.add_argument("--supplement", help="外部 AI 填写的补充 JSON，优先级最高")
    args = parser.parse_args()
    try:
        if args.command == "index":
            data = build_index(args.csv, args.out)
            print(f"[OK] CSV {data['csv_rows']} 行；索引 {data['indexed_rows']} 条；SHA-256 {data['source_sha256']}")
        else:
            enhanced, missing = enrich(args.pack, args.dictionary, args.out, args.missing, args.terms, args.supplement)
            print(f"[OK] 增强 {len(enhanced['entries'])} 条；待补充 {len(missing['entries'])} 项；原始包未修改")
        return 0
    except (OSError, ValueError, TypeError, KeyError, csv.Error) as error:
        print("[ERROR] " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
