# 知识包校验与导出

校验已编写中文的正式包，不直接接受原始提取草稿。

```powershell
python validator/validate.py --pack knowledge-packs/05_createtask-pack.json
python validator/validate.py --pack knowledge-packs/05_createtask-pack.json --src 'D:\FreeRtos\projects\freertos-learning' --out ready.json
```

成功返回 0，输入、校验或导出失败返回 1。失败不覆盖已有正式导出，成功时用目标目录内独立临时文件原子替换。

错误包括：根节点或词条类型错误，空名称/版本，`entries` 非数组，缺少合法 `symbol` 或非空 `name_zh`，非法类别，同一 `scope + symbol` 重复，参数字段类型错误或参数名重复，来源路径无效，行号不是正的安全整数。

类别允许 `function`、`variable`、`macro`、`enum`、`typedef`。可选文字字段允许省略，存在时必须为字符串。来源必须是兼容 Windows 的相对路径：拒绝盘符、UNC、根路径、`..` 路径段和非法字符。启用 `--src` 后检查文件存在且解析后仍在根目录内；不传 `--src` 不证明文件存在。

缺少函数参数数组、非空 `uncertainty` 为警告，不阻止导出。中文语义及收录决策仍须人工复核。

插件采用相同结构规则，不要求持有源码；两端用 `tests/fixtures/pack-validation.json` 检查一致性。

05 来源快照检查：`python scripts/check-05-pack.py --src 'D:\FreeRtos\projects\freertos-learning'`。该命令额外核对逐文件 SHA-256，源码变化后须重新复核。
