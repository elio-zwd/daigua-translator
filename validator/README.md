# validator — 知识包校验工具

校验知识包 JSON 的格式、必填字段、重复词条，并导出最终知识包。

## 待开发内容

- `validate.py` — 主入口
  - `--pack` 指定知识包 JSON 路径
  - `--src` 可选，传入工程目录时校验 `source.file` 路径是否存在
- 校验规则：
  - `symbol`、`kind`、`name_zh`、`source` 不为空
  - 同一 `scope` 下 `symbol` 不重复（有重复时报告，不自动合并）
  - `kind` 枚举值合法：`function` / `variable` / `macro` / `enum` / `typedef`
- 输出：校验报告（控制台）+ 通过后的标准化知识包 JSON
