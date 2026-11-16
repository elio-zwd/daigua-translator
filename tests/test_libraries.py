import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from phonetics.library import read_library, validate_library
from phonetics.tool import enrich, read_json, write_json

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("migrate_libraries", ROOT / "scripts/migrate-libraries.py")
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class LibraryTests(unittest.TestCase):
    def test_shared_catalog_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for item in read_json(ROOT / "tests/fixtures/catalog-validation.json"):
                with self.subTest(item=item["name"]):
                    write_json(directory / "library.json", item["catalog"])
                    if item["valid"]:
                        read_library(directory)
                    else:
                        with self.assertRaises(ValueError):
                            read_library(directory)

    def test_delivered_catalog_and_preserved_sources(self):
        _, _, _, counts = validate_library(ROOT / "dictionaries")
        # The independent catalog accumulates entries; new projects and terms
        # must not make the historical minimums fail.
        for role, minimum in dict(words=41, naming=28, symbols=191).items():
            self.assertGreaterEqual(counts[role], minimum, role)
        for original, copied in [
            ("knowledge-packs/enhanced/05_createtask-pack.phonetic.json", "dictionaries/symbols/freertos-learning/05_createtask-pack.phonetic.json"),
            ("knowledge-packs/dfu-20261110/project-pack.phonetic.json", "dictionaries/symbols/dfu-course/project-pack.phonetic.json"),
        ]:
            self.assertEqual(read_json(ROOT / original), read_json(ROOT / copied))
        words = read_json(ROOT / "dictionaries/words/01-technical-terms.json")["entries"]
        ek = next(t for t in words if t["token"] == "EK")
        self.assertEqual(ek["translation"], "熠日照明")
        self.assertEqual(ek["review_status"], "confirmed")

    def test_migration_splits_roles_preserves_inputs_and_refuses_existing_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            terms, pack = directory / "terms.json", directory / "pack.json"
            word = dict(token="EK", match="insensitive", translation="熠日照明", reading="unknown", source="user-confirmed", review_status="confirmed")
            naming = dict(word, token="board_init", match="identifier", translation="板级初始化")
            write_json(terms, dict(format_version=1, entries=[word, naming]))
            write_json(pack, dict(name="旧工程", version="1", entries=[]))
            before = [f.read_bytes() for f in [terms, pack]]
            output = directory / "new"
            catalog = migration.migrate(output, [terms], [pack])
            self.assertEqual(catalog["projects"][0]["source_roots"], [])
            self.assertEqual([f.read_bytes() for f in [terms, pack]], before)
            self.assertEqual(read_json(output / catalog["word_libraries"][0])["entries"], [word])
            self.assertEqual(read_json(output / catalog["naming_libraries"][0])["entries"], [naming])
            with self.assertRaises(ValueError):
                migration.migrate(output, [terms], [pack])
            write_json(output / "words/not-enabled.json", {"broken": True})
            validate_library(output)

    def test_settings_jsonc_and_invalid_roles(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            settings = directory / "settings.json"
            settings.write_text('{// comment\n"url":"https://example.invalid/a",/* block */"paths":["C:\\\\a",],}', encoding="utf-8")
            parsed = migration.read_settings(settings)
            self.assertEqual(parsed["url"], "https://example.invalid/a")
            self.assertEqual(parsed["paths"], ["C:\\a"])
            write_json(directory / "library.json", dict(format_version=1, word_libraries=["bad.json"], naming_libraries=[], projects=[]))
            write_json(directory / "bad.json", dict(format_version=1, entries=[dict(token="x", match="prefix", translation="前缀", reading="silent", source="fixture", review_status="unreviewed")]))
            with self.assertRaises(ValueError):
                validate_library(directory)

    def test_migration_enables_only_enhanced_copy_of_the_same_batch(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            raw, enhanced = directory / "raw.json", directory / "enhanced.json"
            pack = dict(name="同批次", version="1", entries=[])
            write_json(raw, pack)
            write_json(enhanced, dict(pack, pronunciation_metadata=dict(original_sha256=hashlib.sha256(raw.read_bytes()).hexdigest())))
            output = directory / "new"
            catalog = migration.migrate(output, packs=[raw, enhanced])
            self.assertEqual(len(catalog["projects"]), 1)
            self.assertTrue(catalog["projects"][0]["symbol_libraries"][0].endswith("enhanced.json"))
            self.assertEqual(len(read_json(output / "migration-report.json")["not_enabled"]), 1)
            self.assertTrue(raw.exists())

    def test_enrich_without_library_does_not_add_hidden_readings(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            index = directory / "index"
            index.mkdir()
            write_json(index / "manifest.json", dict(format_version=1, source_sha256="a" * 64, shards={}))
            pack = directory / "pack.json"
            write_json(pack, dict(name="空输入", version="1", entries=[dict(symbol="LED", kind="variable", name_zh="灯", source=dict(file="main.c"))]))
            enhanced, missing = enrich(pack, index, directory / "enhanced.json", directory / "missing.json")
            self.assertEqual(enhanced["entries"][0]["pronunciation"]["segments"][0]["reading"], "unknown")
            self.assertEqual(missing["entries"][0]["token"], "LED")


if __name__ == "__main__":
    unittest.main()
