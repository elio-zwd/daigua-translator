"""Cross-language contracts: mirrored by plugin/src/{identifier-words,pronunciation}.ts."""
import re


def split_identifier(symbol):
    text = re.sub(r"([a-z])([A-Z])", r"\1_\2", symbol)
    text = re.sub(r"([A-Z])([A-Z][a-z])", r"\1_\2", text)
    return re.findall(r"[A-Za-z]+|[0-9]+", text)


def is_prefix(symbol, token, index):
    return index == 0 and symbol.startswith(token) and bool(re.match(r"[A-Z]", symbol[len(token):]))


def find_terms(libraries, symbol, token, index, whole=False):
    for library in libraries:
        matches = [t for t in library if (t["match"] == "identifier") == whole
                   and (not t.get("symbol") or t["symbol"] == symbol)
                   and (t["token"].lower() == token.lower() if t["match"] == "insensitive" else t["token"] == token)
                   and (t["match"] != "prefix" or is_prefix(symbol, token, index))]
        if any(t.get("symbol") == symbol for t in matches):
            matches = [t for t in matches if t.get("symbol") == symbol]
        if matches:
            return matches
    return []


def sanitize_pronunciation(value, warn=lambda message: None):
    if not isinstance(value, dict) or not isinstance(value.get("segments"), list):
        warn("忽略无效 pronunciation：segments 必须是数组")
        return None
    valid = []
    for item in value["segments"]:
        if (not isinstance(item, dict)
                or not isinstance(item.get("text"), str) or not item["text"].strip()
                or item.get("reading") not in ("word", "letters", "silent", "unknown")
                or item.get("status") not in ("resolved", "pending", "skipped")
                or not isinstance(item.get("source"), str) or not item["source"].strip()
                or ("phonetic" in item and not isinstance(item["phonetic"], str))
                or ("review_status" in item and item["review_status"] not in ("unreviewed", "confirmed"))
                or (item.get("status") == "resolved" and (item["reading"] == "unknown"
                    or (item["reading"] != "silent" and not item.get("phonetic", "").strip())))):
            warn("忽略无效 pronunciation 片段")
            continue
        valid.append(dict(item))
    return {"segments": valid} if valid else None


def validate_terms(data):
    if not isinstance(data, dict) or type(data.get("format_version")) is not int or data["format_version"] != 1 or not isinstance(data.get("entries"), list):
        raise ValueError("技术库格式不兼容")
    for t in data["entries"]:
        if (not isinstance(t, dict) or not isinstance(t.get("token"), str)
                or not re.fullmatch(r"[A-Za-z_]\w*" if t.get("match") == "identifier" else r"[A-Za-z]+", t["token"], re.ASCII)
                or t.get("match") not in ("exact", "insensitive", "prefix", "identifier")
                or t.get("reading") not in ("word", "letters", "silent", "unknown")
                or not isinstance(t.get("translation"), str)
                or not isinstance(t.get("source"), str) or not t["source"].strip()
                or t.get("review_status") not in ("unreviewed", "confirmed")
                or ("symbol" in t and (not isinstance(t["symbol"], str) or not re.fullmatch(r"[A-Za-z_]\w*", t["symbol"], re.ASCII)))
                or ("expansion" in t and not isinstance(t["expansion"], str))
                or ("phonetic" in t and not isinstance(t["phonetic"], str))
                or (t.get("reading") in ("word", "letters") and not t.get("phonetic", "").strip())):
            raise ValueError("无效技术库词条")
    return data["entries"]
