import copy
import json
import tempfile
import unittest
import subprocess
import sys
from pathlib import Path

from extractor.extract import MCUExtractor, mask_non_code
from validator.validate import validate_data, validate_pack


class ToolingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.src = self.root / "src"
        self.src.mkdir()

    def test_function_body_header_dedup_global_variables(self):
        (self.src / "main.h").write_text(
            "/**\n * @brief 启动电机\n * @param speed PWM 占空比\n */\n"
            "void Motor_Start(int speed);\n", encoding="utf-8")
        (self.src / "main.c").write_text(
            "// 运行时毫秒计数\n"
            "uint32_t g_tick_ms;\n"
            "static const uint32_t intervals[2] = {500,1000};\n"
            "void Motor_Start(int speed) {\n"
            "    const char *s = \"brace } {\";\n"
            "    if (speed) { g_tick_ms++; }\n"
            "}\n", encoding="utf-8")
        ext = MCUExtractor(self.root)
        for file in ext.collect_source_files(None, self.src):
            ext.process_file(file)
        ext.deduplicate()
        funcs = [f for f in ext.functions if f["symbol"] == "Motor_Start"]
        self.assertEqual(len(funcs), 1)
        self.assertIn("g_tick_ms++", funcs[0]["body"])
        self.assertEqual(funcs[0]["name_zh"], "启动电机")
        self.assertEqual(funcs[0]["parameters"][0]["description_zh"], "PWM 占空比")
        variables = {v["symbol"] for v in ext.variables}
        self.assertIn("g_tick_ms", variables)
        self.assertIn("intervals", variables)
        tick = next(v for v in ext.variables if v["symbol"] == "g_tick_ms")
        self.assertIn("运行时毫秒计数", tick["existing_comment"])
        self.assertNotIn("s", variables)

    def test_cpp_single_file_mode(self):
        file = self.src / "bridge.cpp"
        file.write_text("int Bridge_Start(int mode) { return mode + 1; }\n", encoding="utf-8")
        ext = MCUExtractor(self.root)
        self.assertEqual(ext.collect_source_files(None, file), [file.resolve()])
        ext.process_file(file)
        self.assertIn("Bridge_Start", [f["symbol"] for f in ext.functions])

    def test_keil_nested_headers(self):
        project_dir = self.root / "mdk_v5"
        project_dir.mkdir()
        include = self.root / "include" / "sub"
        include.mkdir(parents=True)
        header = include / "device.hpp"
        header.write_text("void Device_Init(void);\n", encoding="utf-8")
        (self.src / "main.c").write_text("void Device_Init(void) {}\n", encoding="utf-8")
        project = project_dir / "demo.uvprojx"
        project.write_text(
            "<Project><Files><File><FilePath>../src/main.c</FilePath></File></Files>"
            "<IncludePath>../include</IncludePath></Project>", encoding="utf-8")
        ext = MCUExtractor(self.root)
        files = ext.collect_source_files(project, None)
        self.assertIn(header.resolve(), files)
        for file in files:
            ext.process_file(file)
        ext.deduplicate()
        self.assertEqual(sum(f["symbol"] == "Device_Init" for f in ext.functions), 1)

    def test_mask_and_uncertainties(self):
        raw = 'const char *s = "}"; /* { */\nvoid Good(void) {}\n'
        self.assertEqual(len(raw), len(mask_non_code(raw)))
        file = self.src / "fault.c"
        file.write_text("void (*callback)(int);\n", encoding="utf-8")
        ext = MCUExtractor(self.root)
        ext.process_file(file)
        self.assertTrue(any("函数指针" in u["reason"] for u in ext.uncertain))

    def test_common_mcu_macros_enums_typedef_and_pointer_function(self):
        file = self.src / "peripheral.c"
        file.write_text(
            "#define MOTOR_SPEED 42\n"
            "typedef enum { MOTOR_STOP = 0, MOTOR_RUN = 1 } MotorState;\n"
            "typedef unsigned int CounterType;\n"
            "/** @brief 读取状态\n * @param[in] dst 目标地址\n * @return 读取长度\n */\n"
            "int *Read_State(int *dst) { return dst; }\n",
            encoding="utf-8",
        )
        ext = MCUExtractor(self.root)
        ext.process_file(file)
        symbols = {x["symbol"] for x in ext.macros}
        self.assertTrue({"MOTOR_SPEED", "MotorState", "MOTOR_STOP", "MOTOR_RUN",
                         "CounterType"} <= symbols)
        matches = [f for f in ext.functions if f["symbol"] == "Read_State"]
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["name_zh"], "读取状态")
        self.assertEqual(matches[0]["parameters"][0]["description_zh"], "目标地址")
        self.assertEqual(matches[0]["returns_zh"], "读取长度")

    def test_conditional_compilation_is_flagged(self):
        file = self.src / "board.c"
        file.write_text("#if defined(BOARD_A)\nint Pin_Init(void) { return 1; }\n#endif\n",
                        encoding="utf-8")
        ext = MCUExtractor(self.root)
        ext.process_file(file)
        self.assertTrue(any("条件编译" in item["reason"] for item in ext.uncertain))

    def test_output_contract(self):
        file = self.src / "core.c"
        file.write_text("int Compute(int x) { return x; }\n", encoding="utf-8")
        ext = MCUExtractor(self.root)
        ext.process_file(file)
        dest = self.root / "out"
        ext.export(dest)
        for filename in ("functions.json", "variables.json", "macros.json",
                         "uncertain.json", "extract_summary.txt"):
            self.assertTrue((dest / filename).is_file(), filename)
        data = json.loads((dest / "functions.json").read_text(encoding="utf-8"))
        self.assertIn("Compute", [entry["symbol"] for entry in data])

    def valid_pack(self):
        return {
            "name": "test", "version": "1.0",
            "entries": [{
                "symbol": "Motor_Start", "kind": "function", "name_zh": "启动电机",
                "scope": "motor.c", "parameters": [],
                "source": {"file": "src/motor.c", "line": 1},
            }],
        }

    def error_containing(self, pack, text):
        errors, _ = validate_data(pack, self.root)
        self.assertTrue(any(text in item for item in errors), errors)

    def test_invalid_root(self):
        self.assertTrue(validate_data([])[0])
        self.assertTrue(validate_data({"name": "x", "version": "1", "entries": {}})[0])

    def test_strict_kind_and_name(self):
        pack = self.valid_pack()
        pack["entries"][0]["kind"] = "incorrect"
        self.error_containing(pack, "非法 kind")
        pack["entries"][0]["kind"] = "function"
        pack["entries"][0]["name_zh"] = ""
        self.error_containing(pack, "name_zh")

    def test_duplicate_scope_and_types(self):
        pack = self.valid_pack()
        pack["entries"].append(copy.deepcopy(pack["entries"][0]))
        self.error_containing(pack, "重复词条")
        pack["entries"][1]["scope"] = "another.c"
        self.assertEqual(validate_data(pack)[0], [])
        pack["entries"][0]["parameters"] = {}
        self.error_containing(pack, "parameters 必须是数组")

    def test_missing_and_escaped_source(self):
        pack = self.valid_pack()
        pack["entries"][0]["source"]["file"] = "../outside.c"
        self.error_containing(pack, "越过源码根目录")
        pack["entries"][0]["source"]["file"] = "not-there.c"
        self.error_containing(pack, "来源文件不存在")
        pack["entries"][0]["source"]["line"] = 0
        self.error_containing(pack, "正整数")

    def test_export_only_if_valid(self):
        (self.src / "motor.c").write_text("void Motor_Start(void) {}\n", encoding="utf-8")
        pack = self.valid_pack()
        source = self.root / "pack.json"
        output = self.root / "export.json"
        source.write_text(json.dumps(pack), encoding="utf-8")
        self.assertTrue(validate_pack(str(source), str(self.root), str(output)))
        pack["entries"][0]["name_zh"] = ""
        source.write_text(json.dumps(pack), encoding="utf-8")
        output.unlink()
        self.assertFalse(validate_pack(str(source), str(self.root), str(output)))
        self.assertFalse(output.exists())

    def test_repo_example_packs_pass(self):
        root = Path(__file__).resolve().parents[1]
        for path in ("05_createtask-pack.json", "example/example-pack.json"):
            pack = json.loads((root / "knowledge-packs" / path).read_text(encoding="utf-8"))
            self.assertEqual(validate_data(pack)[0], [], path)

    def test_shared_plugin_validation_contract(self):
        fixtures = Path(__file__).parent / 'fixtures' / 'pack-validation.json'
        for case in json.loads(fixtures.read_text(encoding='utf-8')):
            with self.subTest(case=case['name']):
                self.assertEqual(not validate_data(case['pack'])[0], case['valid'])

    def test_shared_source_root_and_cli_failure_preserves_output(self):
        lesson = self.root / 'lesson'
        lesson.mkdir()
        shared = self.root / 'common'
        shared.mkdir()
        (shared / 'board.c').write_text('int board_ready;\n', encoding='utf-8')
        project = lesson / 'demo.uvprojx'
        project.write_text('<Project><FilePath>../common/board.c</FilePath></Project>', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '--root'):
            MCUExtractor(lesson).collect_source_files(project)
        output = self.root / 'output'
        output.mkdir()
        existing = output / 'variables.json'
        existing.write_text('original', encoding='utf-8')
        repo = Path(__file__).resolve().parents[1]
        command = [sys.executable, str(repo / 'extractor' / 'extract.py'), '--proj', str(project), '--out', str(output)]
        failed = subprocess.run(command, capture_output=True, encoding='utf-8')
        self.assertEqual(failed.returncode, 1)
        self.assertIn('--root', failed.stderr)
        self.assertEqual(existing.read_text(encoding='utf-8'), 'original')
        success = subprocess.run(command + ['--root', str(self.root)], capture_output=True, encoding='utf-8')
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertEqual(json.loads(existing.read_text(encoding='utf-8'))[0]['source']['file'], 'common/board.c')

    def test_extern_variable_dedup_preserves_statics_and_incompatible_declarations(self):
        (self.src / 'board.h').write_text('extern volatile int ready;\nextern float incompatible;\n', encoding='utf-8')
        (self.src / 'board.c').write_text('volatile int ready;\nint incompatible;\nstatic int counter;\n', encoding='utf-8')
        (self.src / 'other.c').write_text('static int counter;\n', encoding='utf-8')
        ext = MCUExtractor(self.root)
        for file in ext.collect_source_files(src_dir=self.src): ext.process_file(file)
        ext.deduplicate()
        ready = [v for v in ext.variables if v['symbol'] == 'ready']
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0]['source']['file'], 'src/board.c')
        self.assertEqual(sum(v['symbol'] == 'counter' for v in ext.variables), 2)
        self.assertEqual(sum(v['symbol'] == 'incompatible' for v in ext.variables), 2)

    def test_optional_locals_keep_function_and_shadowed_scope(self):
        file = self.src / 'tasks.c'
        file.write_text('''void worker(void) {
    uint32_t period = get_period();
    uint32_t tmp = 1;
    if (period) {
        uint32_t period = 7;
    }
    return;
}
void other(void) {
    uint32_t period = 9;
    uint32_t first = 0, second = 1;
    void (*callback)(int);
}
''', encoding='utf-8')
        ordinary = MCUExtractor(self.root)
        ordinary.process_file(file)
        self.assertEqual(ordinary.variables, [])
        ext = MCUExtractor(self.root, include_locals=True)
        ext.process_file(file)
        periods = [v for v in ext.variables if v['symbol'] == 'period']
        self.assertEqual(len(periods), 3)
        self.assertEqual(len({v['scope'] for v in periods}), 3)
        self.assertIn('get_period()', periods[0]['declaration'])
        self.assertEqual(periods[0]['function'], 'worker')
        self.assertIn('uint32_t period', periods[0]['context'])
        self.assertNotIn('tmp', [v['symbol'] for v in ext.variables])
        self.assertNotIn('first', [v['symbol'] for v in ext.variables])
        self.assertTrue(any('复杂局部声明' in u['reason'] for u in ext.uncertain))
        self.assertTrue(any('函数指针' in u['reason'] for u in ext.uncertain))

    def test_invalid_pack_does_not_overwrite_existing_export(self):
        source, output = self.root / 'pack.json', self.root / 'ready.json'
        source.write_text('{"entries": []}', encoding='utf-8')
        output.write_text('previous valid content', encoding='utf-8')
        self.assertFalse(validate_pack(source, out_path=output))
        self.assertEqual(output.read_text(encoding='utf-8'), 'previous valid content')


if __name__ == "__main__":
    unittest.main()
