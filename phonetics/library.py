"""Independent directory catalog shared by maintenance tools (no implicit data)."""
import json
from pathlib import Path, PureWindowsPath
from phonetics.model import validate_terms


def read_json(file):
    return json.loads(Path(file).read_text(encoding="utf-8-sig"))


def library_file(root, relative):
    if not isinstance(relative, str) or not relative.strip() or PureWindowsPath(relative).is_absolute() or PureWindowsPath(relative).drive or Path(relative).is_absolute() or ".." in relative.replace("\\", "/").split("/"):
        raise ValueError("词库文件必须使用目录内的相对路径")
    return (root / relative).resolve()


def read_library(directory):
    root = Path(directory).resolve()
    catalog = read_json(root / "library.json")
    if not isinstance(catalog, dict) or type(catalog.get("format_version")) is not int or catalog["format_version"] != 1:
        raise ValueError("library.json 格式不兼容")
    seen, ids, files = set(), set(), []

    def add(relative, role, project=None):
        file = library_file(root, relative)
        key = str(file).casefold()
        if key in seen:
            raise ValueError("清单重复启用词库文件：" + relative)
        seen.add(key)
        files.append((file, role, project))

    for key, role in [("word_libraries", "words"), ("naming_libraries", "naming")]:
        if not isinstance(catalog.get(key), list):
            raise ValueError(key + " 必须是数组")
        for relative in catalog[key]:
            add(relative, role)
    if not isinstance(catalog.get("projects"), list):
        raise ValueError("projects 必须是数组")
    for project in catalog["projects"]:
        if not isinstance(project, dict) or not isinstance(project.get("id"), str) or not project["id"].strip() or project["id"] in ids or not isinstance(project.get("name"), str) or not project["name"].strip() or not isinstance(project.get("source_roots"), list) or any(not isinstance(r, str) or not r.strip() for r in project["source_roots"]) or not isinstance(project.get("symbol_libraries"), list):
            raise ValueError("工程 ID、名称或目录配置无效")
        ids.add(project["id"])
        for relative in project["symbol_libraries"]:
            add(relative, "symbols", project["id"])
    dictionary = catalog.get("dictionary_path", "")
    if not isinstance(dictionary, str):
        raise ValueError("dictionary_path 必须是字符串")
    return catalog, files, str((root / dictionary).resolve()) if dictionary.strip() else ""


def validate_library(directory):
    from validator.validate import validate_data
    catalog, files, dictionary = read_library(directory)
    counts = dict(words=0, naming=0, symbols=0)
    for file, role, _ in files:
        value = read_json(file)
        if role == "symbols":
            errors, _ = validate_data(value)
            if errors:
                raise ValueError(str(file) + ": " + "; ".join(errors))
            counts[role] += len(value["entries"])
        else:
            entries = validate_terms(value)
            allowed = {"exact", "insensitive"} if role == "words" else {"prefix", "identifier"}
            if any(t["match"] not in allowed for t in entries):
                raise ValueError(str(file) + ": 词条不属于 " + role)
            counts[role] += len(entries)
    return catalog, files, dictionary, counts
