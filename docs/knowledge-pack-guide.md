# MCU 知识包制作流程

使用 Antigravity、Codex 等 AI 编程工具协助理解源码，插件运行时不使用在线 AI。

## 1. 从工程提取事实

```powershell
python extractor/extract.py --proj "D:\\MCU\\mdk_v5\\project.uvprojx" --out extractor/out
```

也可以用 `--src` 指定源码目录或单个 `.c/.cpp` 文件。工具输出 `functions.json`、`variables.json`、`macros.json`、`uncertain.json` 和统计摘要。

优先阅读 `uncertain.json`；该文件不是穷尽性的错误检测，不可把空文件理解为“提取结果完全准确”。

## 2. AI 阅读事实并写中文词条

按源码文件或模块分批将中间 JSON 交给 AI。按实际实现与必要源码补充：

- `name_zh`：非空的中文名称。
- `description_zh`：函数作用或变量用途。
- `parameters[].description_zh`、`returns_zh`：有证据才填写。
- `source.file`、`source.line`、`scope`：保留真实信息，避免同名冲突。
- `uncertainty`：不能核实的地方，不要编造。

**注意**：提取器生成的原始词条 `name_zh` 可能为空，不能直接通过正式知识包校验器。需要先由 AI 和人工补全。

## 3. 复核并严格校验

```powershell
python validator/validate.py --pack knowledge-packs/my-pack.json --src "D:\\MCU" --out knowledge-packs/ready.json
```

校验器会拒绝同作用域重复符号、非法类别、空中文名、类型错误。传入 `--src` 时，找不到真实源码会导致失败；不传 `--src` 不能据此认为来源已验证。

## 4. 加载与更新

把通过校验的 JSON 绝对路径写入 `daiguaTranslate.packPaths`，并运行“呆瓜翻译器：重新加载知识包”。

更新时先重新提取受影响文件，AI 对照旧词条生成差异，再经过人工复核与校验。插件侧已支持更新知识包快照；但 MTranCode **宿主缓存**对已经查询过的相同符号仍可能返回旧释义，详见 `docs/mtrancode-integration.md`。
