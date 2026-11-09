import copy
import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from phonetics.tool import build_index, enrich, file_hash, read_json, write_json
from phonetics.model import split_identifier, sanitize_pronunciation, validate_terms
from validator.validate import validate_data


class PhoneticTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="呆瓜 音标-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.csv = self.root / "ecdict.csv"
        (self.root / "LICENSE").write_text("test fixture license", encoding="utf-8")
        with self.csv.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["word", "phonetic", "translation"])
            writer.writerows([["motor", "'mәutә", "马达, 发动机"], ["start", "stɑ:t", "开始\\n启动"],
                              ["led", "led", "lead的过去式"], ["MS", "miz", "女士"],
                              ["worker", "wɜːkə", "工作者"], ["unknown", "", "无音标"],
                              ["MYSTERY", "wrong", "缩写"], ["read", "ri:d", "读"],
                              ["read", "red", "已读"], ["a phrase", "", "短语"]])
        self.index = self.root / "索引"
        build_index(self.csv, self.index)
        self.pack = self.root / "原始.json"
        self.original = dict(name="测试", version="1", entries=[dict(symbol="Motor_Start", kind="function", name_zh="启动",
            description_zh="原有中文", source=dict(file="main.c", line=1), parameters=[dict(name="arg", description_zh="原有参数")])])
        write_json(self.pack, self.original)
        self.output, self.missing = self.root / "增强.json", self.root / "缺失.json"

    def run_enrich(self, **kwargs):
        return enrich(self.pack, self.index, self.output, self.missing, **kwargs)

    def test_shared_split_contract(self):
        for symbol, expected in read_json(ROOT / "tests/fixtures/identifier-words.json"):
            with self.subTest(symbol=symbol):
                self.assertEqual(split_identifier(symbol), expected)

    def test_shared_optional_pronunciation_contract(self):
        for item in read_json(ROOT / "tests/fixtures/pronunciation.json"):
            with self.subTest(name=item["name"]):
                warnings = []
                result = sanitize_pronunciation(item["value"], warnings.append)
                self.assertEqual(len(result["segments"]) if result else 0, item["segments"])
                self.assertEqual(len(warnings), item["warnings"])

    def test_missing_tokens_deduplicate_with_all_occurrences(self):
        self.original["entries"][0]["symbol"] = "MYSTERY"
        second = copy.deepcopy(self.original["entries"][0])
        second["symbol"] = "Other_MYSTERY"
        self.original["entries"].append(second)
        write_json(self.pack, self.original)
        _, missing = self.run_enrich()
        mystery = [e for e in missing["entries"] if e["token"] == "MYSTERY"]
        self.assertEqual(len(mystery), 1)
        self.assertEqual(len(mystery[0]["occurrences"]), 2)

    def test_technical_library_version_and_bad_input(self):
        with self.assertRaises(ValueError):
            validate_terms(dict(format_version=True, entries=[]))
        write_json(self.index / "manifest.json", [])
        with self.assertRaises(ValueError):
            self.run_enrich()

    def test_csv_quotes_bom_and_verbatim_phonetic(self):
        manifest = read_json(self.index / "manifest.json")
        self.assertEqual(manifest["csv_rows"], 10)
        self.assertEqual(manifest["indexed_rows"], 9)
        self.assertEqual(manifest["source_sha256"], file_hash(self.csv))
        self.assertEqual(read_json(self.index / "mo.json")["motor"][0]["phonetic"], "'mәutә")
        self.assertTrue((self.index / "LICENSE").is_file())
        with self.assertRaises(ValueError):
            build_index(self.csv, self.index)

    def test_enrich_preserves_original_and_all_chinese(self):
        before = self.pack.read_bytes()
        enhanced, missing = self.run_enrich()
        self.assertEqual(before, self.pack.read_bytes())
        entry = enhanced["entries"][0]
        self.assertEqual([p["text"] for p in entry["pronunciation"]["segments"]], ["Motor", "Start"])
        self.assertEqual(entry["parameters"][0]["pronunciation"]["segments"][0]["reading"], "letters")
        stripped = copy.deepcopy(enhanced)
        stripped.pop("pronunciation_metadata")
        for e in stripped["entries"]:
            e.pop("pronunciation")
            for p in e["parameters"]:
                p.pop("pronunciation")
        self.assertEqual(stripped, self.original)
        self.assertEqual(missing["entries"], [])
        again, _ = self.run_enrich()
        self.assertEqual(enhanced, again)

    def test_abbreviations_override_false_dictionary_hits_and_prefix_is_position_limited(self):
        self.original["entries"][0]["symbol"] = "xLED_MS_MYSTERY16"
        write_json(self.pack, self.original)
        result, missing = self.run_enrich()
        segments = result["entries"][0]["pronunciation"]["segments"]
        self.assertEqual([s["reading"] for s in segments], ["silent", "letters", "word", "unknown", "unknown"])
        self.assertEqual(segments[2]["phonetic"], "ˈmɪlɪˌsekəndz")
        self.assertEqual(segments[3]["status"], "pending")
        self.assertEqual(segments[4]["status"], "skipped")
        self.assertEqual(missing["entries"][0]["token"], "MYSTERY")
        self.original["entries"][0]["symbol"] = "x"
        write_json(self.pack, self.original)
        result, _ = self.run_enrich()
        self.assertNotEqual(result["entries"][0]["pronunciation"]["segments"][0]["reading"], "silent")

    def test_ai_roundtrip_precedence_and_pending_states(self):
        self.original["entries"][0]["symbol"] = "MYSTERY_unknown_read"
        write_json(self.pack, self.original)
        _, missing = self.run_enrich()
        self.assertEqual(len(missing["entries"]), 3)
        supplement = self.root / "AI.json"
        missing["entries"][0].update(reading="letters", phonetic="test-ipa", source="external-ai:test")
        write_json(supplement, missing)
        enhanced, remaining = self.run_enrich(supplement=supplement)
        segment = enhanced["entries"][0]["pronunciation"]["segments"][0]
        self.assertEqual(segment["source"], "external-ai:test")
        self.assertEqual(segment["review_status"], "unreviewed")
        self.assertEqual(len(remaining["entries"]), 2)
        self.assertIn("occurrences", remaining["entries"][0])

    def test_complete_type_convention_and_ai_roundtrip(self):
        self.original["entries"][0]["symbol"] = "uint16_t"
        write_json(self.pack, self.original)
        enhanced, missing = self.run_enrich()
        self.assertEqual([s["text"] for s in enhanced["entries"][0]["pronunciation"]["segments"]], ["uint16_t"])
        item = next(e for e in missing["entries"] if e["token"] == "uint16_t")
        self.assertEqual(item["match"], "identifier")
        item.update(reading="letters", phonetic="test", source="external-ai:test")
        supplement = self.root / "完整名称补充.json"
        write_json(supplement, missing)
        enhanced, remaining = self.run_enrich(supplement=supplement)
        self.assertEqual(remaining["entries"], [])
        segment = enhanced["entries"][0]["pronunciation"]["segments"][0]
        self.assertEqual(segment["phonetic"], "test")
        self.assertEqual(segment["review_status"], "unreviewed")

    def test_complete_type_convention_does_not_match_fragments(self):
        self.original["entries"][0]["symbol"] = "my_uint16_t"
        write_json(self.pack, self.original)
        enhanced, _ = self.run_enrich()
        self.assertEqual([s["text"] for s in enhanced["entries"][0]["pronunciation"]["segments"]], ["my", "uint", "16", "t"])

    def test_model_fragment_does_not_inherit_an_ordinary_word_pronunciation(self):
        self.original["entries"][0]["symbol"] = "Motor32_Start"
        write_json(self.pack, self.original)
        result, missing = self.run_enrich()
        segments = result["entries"][0]["pronunciation"]["segments"]
        self.assertEqual([s["status"] for s in segments], ["pending", "skipped", "resolved"])
        self.assertNotIn("phonetic", segments[0])
        self.assertEqual(missing["entries"][0]["token"], "Motor")

    def test_bad_optional_pronunciation_warns_not_rejects_chinese(self):
        self.original["entries"][0]["pronunciation"] = {"segments": [dict(text="Motor", reading="word", source="ECDICT", status="resolved")]}
        errors, warnings = validate_data(self.original)
        self.assertFalse(errors)
        self.assertTrue(any("pronunciation" in w for w in warnings))
        self.assertIsNone(sanitize_pronunciation(self.original["entries"][0]["pronunciation"]))

    def test_failure_does_not_overwrite_inputs_or_existing_outputs(self):
        self.run_enrich()
        before = self.output.read_bytes()
        with self.assertRaises(ValueError):
            enrich(self.pack, self.index, self.pack, self.missing)
        with self.assertRaises(ValueError):
            enrich(self.pack, self.index, self.output, self.output)
        bad = self.root / "bad.json"
        write_json(bad, dict(format_version=1, entries=[dict(token="Motor", match="exact", reading="word")]))
        with self.assertRaises(ValueError):
            self.run_enrich(supplement=bad)
        self.assertEqual(self.output.read_bytes(), before)
        self.assertEqual(read_json(self.pack), self.original)

    def test_index_traversal_and_bad_schema_rejected(self):
        manifest = read_json(self.index / "manifest.json")
        manifest["shards"]["mo"] = "../outside.json"
        write_json(self.index / "manifest.json", manifest)
        with self.assertRaises(ValueError):
            self.run_enrich()

    def test_cli_from_another_directory_handles_windows_unicode_paths(self):
        completed = subprocess.run([sys.executable, str(ROOT / "phonetics/tool.py"), "enrich", "--pack", str(self.pack),
            "--dictionary", str(self.index), "--out", str(self.output), "--missing", str(self.missing)], cwd=self.root, capture_output=True)
        self.assertEqual(completed.returncode, 0, completed.stderr.decode("utf-8"))
        self.assertEqual(read_json(self.output)["entries"][0]["name_zh"], "启动")


if __name__ == "__main__":
    unittest.main()
