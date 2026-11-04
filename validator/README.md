# 知识包校验与导出

此工具校验**已经补全中文解释**的正式知识包，不直接接受从源码提取器生成的原始草稿。

## 命令

```powershell
python validator/validate.py --pack knowledge-packs/05_createtask-pack.json
python validator/validate.py --pack knowledge-packs/my-pack.json --src "D:\\MCU" --out knowledge-packs/ready.json
```

返回码：成功为 `0`；校验失败、输入 JSON 损坏或写入失败为 `1`。校验未通过不导出。

## 错误（阻止导出）

- 根节点必须是对象，`name`、`version` 非空且 `entries` 为数组。
- 词条 `symbol`、`kind`、`name_zh`、`source.file` 必填且类型正确。
- `kind` 仅允许 `function`、`variable`、`macro`、`enum`、`typedef`。
- 同一 `scope + symbol` 不允许重复（不同作用域可保留同名）。
- 源码行号必须为正整数；参数数组、参数名和常用可选字段必须类型正确。
- 使用 `--src` 时，源文件必须存在且不能使用绝对路径/路径穿越。未传入 `--src` 时仅检查来源路径的格式，**不宣称真实文件存在**。

## 警告（不会阻止导出）

- 可选 `parameters` 数组缺失。
- `uncertainty` 不为空（须人工确认）。

工具只检查结构和文件来源，不检查中文释义是否与 MCU 代码语义一致。人工审阅仍然必需。

## 回归测试

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
```
