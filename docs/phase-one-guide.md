# 0.4.1 独立使用、离线词典与音标流程

本文保留旧版本行为。当前词库分类、加载和跨工程规则见 [0.6.0 独立词库说明](library-directory-0.6.0.md)。

> 当前版本 0.5.0 的简明查词、固定面板、中文设置页和 CLI 界面验证见 [新版使用说明](concise-lookup-0.5.0.md)。下文保留第一期工具流程；日常界面以新版说明为准。

用户约定（2026-11-09）：默认直接使用，有问题再反馈，不要求逐条人工审核。AI 负责生成、自动检查和后续修正；来源、缺失信息与原始不确定说明继续保留，既不阻止使用，也不自动标记为已人工核实。

## 安装与使用

从 VSIX 安装 `plugin/daigua-translator.vsix`，重新加载 VS Code。无需 MTranCode，无需模型地址或 API Key。

1. 运行“呆瓜翻译器：选择知识包文件”。可选择旧 JSON，也可选择增强样本 `knowledge-packs/enhanced/05_createtask-pack.phonetic.json`。
2. 在 C/C++ 名称上悬停，查看本地中文说明及已有音标。同名候选全部展示，暂不自动按函数或文件消歧。
3. 右键“呆瓜翻译器：翻译选区或当前名称”，可翻译选区或光标所在名称。命令面板也有“输入文本翻译”。这些主动入口可用于其他语言和普通文本。
4. 有编辑器时结果显示在当前光标的悬停浮窗；无编辑器时显示在“呆瓜翻译器”输出窗口。不会替换原文。
5. 点击状态栏打开快捷设置，选择悬停模式、开关联网、选择词典索引目录或检查诊断。

鼠标离开使 VS Code 取消请求、切换编辑位置、修改文档或配置后，不展示旧请求结果。翻译没有持久化缓存；同一时刻的相同 Bing 请求会合并。单次最多 1000 字符，超长时提示缩小选区，不静默截断。

## 悬停与联网设置

本地知识包始终优先。有本地说明时，不另加逐词中文释义，不把说明再次翻译。悬停保留来源，不显示“待人工复核”；音标缺失只显示“读音暂缺”，原有不确定说明以普通说明显示。音标按组成词另起一行显示“音标（英式优先）”，参数说明及参数独立查询也能显示音标。

| 设置 | 默认值与行为 |
| --- | --- |
| `daiguaTranslate.localHover` | `true`，控制 C/C++ 自动悬停；关闭不影响主动命令 |
| `daiguaTranslate.hoverFallback` | `online` 自动联网；也可选 `ecdict` 离线词典或 `off` 关闭未收录名称释义 |
| `daiguaTranslate.bingEnabled` | `true`，所有入口的联网总开关；关闭不发起新的翻译请求 |
| `daiguaTranslate.bingTimeoutMs` | `5000`，范围 100–30000 毫秒 |
| `daiguaTranslate.dictionaryPath` | 空，配置为含 `manifest.json` 的索引目录，不能填 CSV 路径 |
| `daiguaTranslate.technicalLibraryPaths` | 空数组，额外技术库／项目补充文件的绝对路径，后面的文件优先 |
| `daiguaTranslate.packPaths` | 知识包绝对路径数组，继续支持文件选择 |
| `daiguaTranslate.includeParameters` | `true`，将已有中文说明的函数参数加入查询索引 |
| `daiguaTranslate.autoReload` | `true`，知识包保存后重载；坏包保留上次有效内容 |
| `daiguaTranslate.showStatusBar` | `true` |

`online` 模式遇到 Bing 失败或超时后回退离线词典，并显示联网失败原因。联网总开关关闭时直接查离线词典。`ecdict` 模式只查本地。`off` 模式仍显示已收录的本地说明。

三档模式只控制自动悬停。主动命令优先查本地知识包，未收录名称在允许联网时使用 Bing；关闭联网后查离线词典。普通句子需要联网翻译，不能用单词释义拼成整句译文。

未收录名称的解释标明“普通名称释义，用途未核对”。离线结果按组成词显示原词典义项；词典释义、技术库约定和源码核对过的项目用途是不同信息。

未配置或损坏的 ECDICT 索引不影响本地知识包和可用的技术库。错误显示在结果及输出诊断中。修改技术库或重建词典后，运行“重新加载知识包”清除读取缓存。索引不可原地覆盖；新建目录后切换路径。

Bing 底层库不支持取消已发出的请求，超时或关闭总开关不会撤回这些请求，但后续不会发起新的请求，过期结果不会展示。其他翻译插件可能追加自己的悬停；可自行停用重复插件或关闭其悬停。呆瓜不会改动其他插件设置。

## 准备 ECDICT 索引（只做一次）

Windows 10 x64，使用 Python 3.10+、PowerShell 7。在仓库根目录执行：

```powershell
python -X utf8 phonetics/tool.py index `
  --csv 'M:\005869\My_Elio\ECDICT\ecdict.csv' `
  --out 'M:\005869\My_Elio\ECDICT\daigua-index'
```

CSV 同目录须保留原仓库的 `LICENSE`。脚本拒绝覆盖现有索引目录，失败不替换旧索引。

索引包含 `manifest.json`、按前两个字母分片的 JSON、`LICENSE` 和 `SOURCE.txt`。只提取能匹配标识符组成片段的纯英文字母词，保留原始音标和中文义项。大小写同形记录保留候选，不把词组强行拼成一个标识符词。

本次 CSV SHA-256：`d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc`。共读取 770,611 行，索引 365,948 条记录。数据目录在仓库之外，不纳入 Git 或 VSIX。

运行时插件只读所需分片，最多缓存 8 个分片，不读取完整 CSV，不需要安装 Python。CSV 和索引都不会上传。

## AI 制包后的音标流程

外部 AI 继续按现有方案阅读源码、生成中文知识包，无须先运行符号提取器。初稿生成后调用脚本：

```powershell
python -X utf8 phonetics/tool.py enrich `
  --pack knowledge-packs/05_createtask-pack.json `
  --dictionary 'M:\005869\My_Elio\ECDICT\daigua-index' `
  --out knowledge-packs/enhanced/05_createtask-pack.phonetic.json `
  --missing knowledge-packs/enhanced/05_createtask-missing.json
```

脚本只新增可选音标和数据来源字段，不改中文、符号、参数说明、源码引用或复核状态。原始包不能作为输出路径。增强包与缺失清单必须使用不同的 JSON 路径；验证失败不会覆盖已有输出。重复运行从原始包重新计算，不累积字段。

缺失清单按保留大小写的片段去重，`occurrences` 保留所有关联名称、作用域、参数及来源位置。清单包括未命中、无音标、疑似缩写和多种读法项。数字跳过；未知型号、缩写不猜读音；无边界连写词不自动猜拆分。

将缺失清单复制为独立补充文件，交给外部 AI 填写。每项保留 `token` 和匹配条件，选择读法并记录来源；不确定的项继续使用 `unknown`。`review_status: "confirmed"` 仅用于如实记录实际发生过的人工核验，不是使用前置条件。AI 新增数据继续使用 `unreviewed`，悬停不把该状态展示为用户审核任务。

回填时仍使用原始知识包：

```powershell
python -X utf8 phonetics/tool.py enrich `
  --pack knowledge-packs/05_createtask-pack.json `
  --dictionary 'M:\005869\My_Elio\ECDICT\daigua-index' `
  --supplement knowledge-packs/enhanced/05_createtask-supplement.json `
  --out knowledge-packs/enhanced/05_createtask-pack.phonetic.json `
  --missing knowledge-packs/enhanced/05_createtask-missing.json
```

`--terms` 可重复指定额外技术库，后者优先；`--supplement` 优先级最高。不同来源存在多个未能确定的读法时保留待确认，不随机挑选。

增强包记录原始包、ECDICT 和所用技术库的 SHA-256。ECDICT 的 `phonetic` 原样保存；“英式优先”不代表每项均已核实口音。AI 补充与 ECDICT 来源分别显示。

## 技术用语库的维护格式

内置库为 `plugin/resources/technical-terms.json`，当前 45 项，涵盖 MCU 缩写、单位、短写、命名前缀及 8 个常见定宽整数类型。数据保留 AI 来源与 `unreviewed` 状态，默认直接使用并按反馈改进，不要求用户审核，也不据此认定项目用途已核实。

通用库、额外技术库和 AI 补充文件使用同一格式：

```json
{
  "format_version": 1,
  "entries": [
    {
      "token": "LED",
      "match": "insensitive",
      "expansion": "light-emitting diode",
      "translation": "发光二极管",
      "reading": "letters",
      "phonetic": "el iː diː",
      "source": "external-ai:填写实际来源",
      "review_status": "unreviewed"
    }
  ]
}
```

- `match`：`identifier` 精确匹配完整名称，优先于拆词，可包含数字与下划线，例如 `uint16_t`；只在完整名称相等时生效，不会把普通变量 `t` 全局解释成类型后缀。`exact` 区分大小写；`insensitive` 忽略大小写；`prefix` 只在名称开头且后接大写字母时生效。单独的 `x` 不会作为静音前缀。
- 可选 `symbol` 限定完整名称。一个库内有匹配的限定项时，它优先于通用项；相同优先级的多义项保留候选。
- `reading`：`word` 读词，`letters` 拼字母，`silent` 不发音前缀，`unknown` 表示读音缺失。前两种必须填写非空音标；后两种可以省略。
- `translation` 可为空，表示含义仍待补充；`source` 不能为空。`review_status` 只能为 `unreviewed` 或 `confirmed`。
- `occurrences`、`reason` 是缺失清单的辅助信息，不会用来改写中文知识包。

LED、ms 等先通过技术库，避免套用 led 过去式、MS 同形记录的音标。单位可记录展开读法（例如 ms 按 milliseconds 读），会保留原片段及来源。遇到其他常用读法可添加候选；不能宣称只有一种行业读法。

项目专用补充保存在该项目的独立文件中。适用于其他工程的内容由 AI 或用户整理进通用库，按后续反馈修正；插件不自动修改数据文件。中文技术释义仅用于未收录名称的参考，不替换已有中文项目说明。

## 增强字段与兼容

词条及参数均可增加：

```json
{
  "pronunciation": {
    "segments": [
      {
        "text": "Motor",
        "reading": "word",
        "phonetic": "'mәutә",
        "source": "ECDICT:数据哈希前12位",
        "status": "resolved"
      }
    ]
  }
}
```

`status` 为 `resolved`、`pending`、`skipped`。技术库和 AI 数据还带 `review_status`。包顶层可选 `pronunciation_metadata` 记录数据版本。旧包无须迁移；音标可选字段局部损坏时忽略相应部分，并输出诊断，不使原有中文失效。原有必需字段校验、坏包保留上次内容等规则保持有效。

## 验证与交付

```powershell
pwsh.exe -NoProfile -File scripts/verify.ps1
# 可选，发送一个普通英文句子验证 Bing
pwsh.exe -NoProfile -File scripts/verify.ps1 -Online
# 本机已安装 VS Code 时，在独立临时配置中验证真实扩展宿主
pwsh.exe -NoProfile -File scripts/test-vscode.ps1
npm.cmd --prefix plugin run package
python -X utf8 scripts/check-vsix.py plugin/daigua-translator.vsix
```

隔离宿主测试不安装到现有 VS Code、不使用原有用户配置，也不自动删除测试证据。日常使用中遇到命令输入框、浮窗、其他插件共存、离线查询或读音问题时再反馈，不要求先完成逐项人工验收。旧版检查记录见[历史记录](acceptance-2026-11-09.md)，本次调整见[0.4.1 反馈记录](feedback-0.4.1.md)。

归档分支 `archive/mtrancode-v0.3` 指向 `f8910af`，保留旧版集成，不再维护。主线不导出旧版翻译源接口，也不自动修改 MTranCode 设置。
