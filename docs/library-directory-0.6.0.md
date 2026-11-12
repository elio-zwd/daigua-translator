# 0.6.0：独立词库目录与跨工程参考

插件只提供读取、查询和展示能力。词库位于插件之外，更新词库无须重新打包 VSIX。运行时不调用 AI，不需要 API Key。

## 三类数据

| 类别 | 解释对象 | 示例 |
| --- | --- | --- |
| 词语释义库 `words/` | 单词、缩写和专业术语 | indication、GPIO、buf、EK |
| 命名约定库 `naming/` | 完整名称和命名规则 | board_init、uint16_t、FreeRTOS px 前缀 |
| 源码符号库 `symbols/` | 工程中实际存在的函数、变量、参数、类型、宏、枚举 | worker、arg、dfu_context_t |

ECDICT 是词语释义的基础来源，继续使用原有索引格式。音标保存在对应词条中；报告、缺失清单、音标回填清单不属于日常词库。

当前目录提供 41 条词语释义、28 条命名约定和 191 条源码符号（参数另外索引）。`EK → 熠日照明` 保留用户确认来源。旧的制作批次仍位于 `knowledge-packs/`，仅用于追溯；清单没有启用它们。

## 开始使用

1. 安装新的 VSIX 并重新加载 VS Code。
2. 打开中文设置页，点击“选择词库目录”，选择仓库中的 `dictionaries` 文件夹。命令“呆瓜翻译器：选择词库目录”提供相同入口。
3. 核对词语、命名、源码三类数量。目录默认保存到用户设置，多个工程共用；已有工作区目录配置时保存至该工作区。
4. 根据实际电脑位置检查清单中的工程源码根目录和可选 ECDICT 路径。工程移动后更新根目录即可，无须修改源码条目。
5. 保存清单或已启用文件后自动重新加载，也可点击“重新加载”。坏文件保留上次有效内容；从有效清单移除的文件立即停用。诊断入口说明失败与保留情况。

插件不自动选择仓库路径，也不修改日常 VS Code 配置。未选择新目录时仅兼容读取旧配置明确指定的文件；选择目录后完全使用清单，不叠加旧路径。

## 清单格式

根文件固定为 `library.json`：

```json
{
  "format_version": 1,
  "word_libraries": ["words/terms.json"],
  "naming_libraries": ["naming/conventions.json"],
  "dictionary_path": "M:/数据/ECDICT/daigua-index",
  "projects": [
    {
      "id": "my-firmware",
      "name": "固件工程",
      "source_roots": ["M:/代码/firmware"],
      "symbol_libraries": ["symbols/my-firmware/project-pack.phonetic.json"]
    }
  ]
}
```

普通词库文件使用目录内相对路径，禁止重复启用同一文件。`dictionary_path` 可省略，可用相对路径或外部索引绝对路径；普通查词不读取完整 CSV。`source_roots` 可为空，此时该工程仅提供参考释义。一个工程可以关联多个源码根目录和多个互补的符号文件，但同一批次原始包和增强包只启用一份。

词语和命名文件沿用 `format_version: 1, entries: [...]` 格式。词语库使用 `exact` 或 `insensitive`；命名库使用 `prefix` 或 `identifier`。同一类匹配中后列出的文件优先，明确限定 `symbol` 的规则优先于该文件中未限定的规则。源码文件沿用原知识包格式。

源码根目录按 Windows 路径忽略大小写、按目录边界匹配；嵌套目录取最长匹配。相同最长根目录归属多个工程时按参考处理，并输出诊断。

## 查询和展示

查询先查源码符号，再查命名约定、词语释义，最后按联网和悬停设置回退。`off` 模式继续只自动显示源码命中。普通句子的联网行为不变。

- 本工程不同释义排在前面，其他工程额外显示最多 3 条不同释义。
- 没有关联工程或本工程尚未整理时，直接显示最多 3 条其他工程参考。
- 比较名称、符号类型、必要所属函数、中文名和一句话用途，仅归一化显示文字的空白；文字相同的合并。近义改写不在运行时合并，交给外部 AI 整理。
- 与本工程相同的其他工程释义合并后不占 3 条名额。原始记录、来源和审核状态保留，不把其他工程解释改为本工程已验证行为。
- 函数、变量、参数、类型、宏和枚举都可参考。同名参数保留所属函数；局部变量有可靠函数作用域时也保留所属函数。
- 悬停、面板和主动查询使用相同结果。日常只显示“本工程”“其他工程参考”等短标签，不显示源码路径。开启调试信息可查看合并来源。

## 迁移和维护

在仓库根目录使用 PowerShell 7：

```powershell
# 复制、分类已有文件，输出目录必须尚不存在；原文件保持不变
python -X utf8 scripts/migrate-libraries.py --config 'C:/路径/settings.json' --out 'M:/词库/新目录'

# 也可显式提供文件；--terms、--pack 可重复
python -X utf8 scripts/migrate-libraries.py --terms 'M:/词库/旧技术库.json' --pack 'M:/词库/旧项目包.json' --dictionary 'M:/ECDICT/daigua-index' --out 'M:/词库/新目录'

python -X utf8 validator/validate.py --library dictionaries
python -X utf8 phonetics/tool.py enrich --library-dir dictionaries --pack 'M:/词库/project-pack.json' --out 'M:/词库/project-pack.phonetic.json' --missing 'M:/词库/missing.json'
```

迁移脚本支持 VS Code settings.json 的注释和尾逗号，只读取旧版三个配置项。没有显式输入时不会加载任何默认数据。可用 `--projects mapping.json` 为旧包提供工程信息，格式为 `{ "原包绝对路径": { "id": "稳定ID", "name": "工程名", "source_roots": ["源码根目录"] } }`；未提供时生成独立 ID，根目录留空。

维护工具用 `--library-dir` 读取清单；不传目录或 `--terms` 时不会补入隐藏规则。单独 `--dictionary` 可覆盖清单索引路径。音标增强继续只增加音标字段，不修改中文解释和原始文件。

外部 AI 的完整交接流程见 [外部 AI 制库说明](external-ai-handoff.md)。验证方法及报告位置见 [脚本说明](../scripts/README.md)。


## 0.6.1：升级窗口中的目录保存

若升级后当前窗口暂未注册 `daiguaTranslate.libraryDirectory`，插件会将目录选择保存到对应用户或工作区的扩展持久状态，立即加载；配置恢复注册后同步到标准设置。重新打开仍可恢复目录，明确的新设置值优先。普通权限或文件写入失败继续显示错误，不会误报已保存。

目录路径按 Windows 大小写和分隔符规则比较。工作区原值无效时，新选择写回工作区；切换到无法加载的另一个目录时，跟随面板清除旧结果，锁定面板保留用户锁定内容。

## 独立版本管理

本机 `dictionaries/` 是独立 Git 仓库，不由插件仓库跟踪。两个仓库分别提交；新环境需要另行取得词库并在插件设置中选择。设置页复制的 AI 提示词自动填入当前生效的词库目录。
