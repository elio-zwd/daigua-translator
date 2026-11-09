# 呆瓜翻译器 0.4.0

独立的 MCU C/C++ 代码知识查询与文本翻译插件，无需 MTranCode。运行时不调用 AI，不需要模型密钥。

## 快速使用

1. 从 VSIX 安装后重新加载窗口。
2. 运行“呆瓜翻译器：选择知识包文件”，选择普通或带音标的增强 JSON。
3. C/C++ 名称悬停显示中文用途与可用音标；同名结果保留候选。
4. 右键“翻译选区或当前名称”，或命令面板“输入文本翻译”。有编辑器时结果显示在悬停浮窗，无编辑器时使用输出窗口，不替换原文。单次最多 1000 字符。
5. 点击状态栏打开快捷设置，选择悬停模式、联网开关或 ECDICT 索引目录。

本地知识包始终优先；普通名称释义带来源和“用途未核对”，不冒充项目功能说明。

## 设置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `daiguaTranslate.packPaths` | `[]` | 知识包绝对路径；可用选择文件命令配置 |
| `daiguaTranslate.localHover` | `true` | C/C++ 自动悬停总开关；主动命令不受影响 |
| `daiguaTranslate.hoverFallback` | `online` | 未收录名称：`online` 自动联网、`ecdict` 离线词典、`off` 关闭自动释义 |
| `daiguaTranslate.bingEnabled` | `true` | 所有入口联网总开关；关闭不发起新请求 |
| `daiguaTranslate.bingTimeoutMs` | `5000` | 等待上限 100–30000 ms；底层已发请求不能撤回 |
| `daiguaTranslate.dictionaryPath` | `""` | 含 manifest.json 的 ECDICT 索引目录，不能填 CSV |
| `daiguaTranslate.technicalLibraryPaths` | `[]` | 额外技术库或项目补充 JSON 的绝对路径，后者优先 |
| `daiguaTranslate.includeParameters` | `true` | 将有中文说明的函数参数加入查询索引 |
| `daiguaTranslate.autoReload` | `true` | 包保存后自动重载，坏包保留上次有效内容 |
| `daiguaTranslate.showStatusBar` | `true` | 显示数量和 Bing 状态 |

三档模式只控制自动悬停；右键和输入命令仍可使用 Bing，受联网总开关约束。Bing 失败或超时后名称改查离线词典；联网关闭时直接查离线词典。普通句子关闭联网后无法翻译，会明确提示。

其他翻译插件可能显示自己的浮窗，可自行停用其重复悬停；本插件不会改动其他插件设置。旧知识包继续可用，没有音标或音标局部损坏不影响中文解释，错误见加载诊断。

## ECDICT 与音标工具

运行时不加载完整 CSV、不需要 Python。完整词典不随 VSIX 提供，先在源码仓库用 Python 3.10+ 运行 `phonetics/tool.py index`，再选择生成的索引目录。音标增强用 `phonetics/tool.py enrich`，生成独立增强包及外部 AI 补充清单。

完整命令、技术库格式及回填示例见[第一期使用指南](../docs/phase-one-guide.md)；[验证与人工验收](../docs/acceptance-2026-11-09.md)记录自动检查与待验收内容。技术库初稿和 AI 补充不代表读法已获人工复核。
