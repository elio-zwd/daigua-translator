# 发给外部 AI：根据工程持续完善词库

适用当前 0.5.0。日常制包以本文为入口；[旧直接阅读方案](ai-direct-read-plan.md)中的独立初稿、旧包盲测和差异验收属于历史试验，不作为日常任务的前置条件。

0.5.1 起，可在插件中文设置页的“词库管理 → 让外部 AI 完善词库”点击“复制完整提示词”。复制内容包含本文全文，可展开查看；发送前填写第 2 节的实际输入。插件随安装包附带说明，复制时无需打开仓库文档。

## 1. 怎么交给外部 AI

优先使用能读取本地文件、搜索源码、写入 JSON 和执行命令的外部 AI。给它以下内容：

1. **目标工程**：源码目录或压缩包，包含工程配置、自有头文件、实际使用的共享模块；说明要处理的工程、Target 或模块。目录路径只有在 AI 能访问同一台电脑时才有效。
2. **本仓库与本说明**：让 AI 读取当前 `AGENTS.md`、本文、`plugin/resources/technical-terms.json`，使用现有校验工具。
3. **已有成果**：有则提供该项目的原始知识包、对应音标增强包、已积累的额外通用技术库和本次问题清单；没有则说明首次制作。日常更新允许直接参考旧包，再回源码核实。
4. **输出位置**：使用新的 `knowledge-packs/<工程名>-<批次>/` 目录，便于加载、比较和后续修正。

如果外部 AI 只有网页对话能力，上传工程和上述文件；不要只发它无法访问的本地路径。分批提供同一工程的文件时保留相对路径，并要求它列明缺失依赖和未读范围。不能执行校验时，由能访问本仓库的一方运行下文命令；不能声称已校验。

## 2. 可直接复制的任务提示词

替换下列输入后，连同本文及工程一起发送。正文是任务指令，后面的格式与命令也是交付要求。

```text
请根据我提供的工程代码，为“呆瓜翻译器”制作或更新词库，并提炼可跨项目复用的稳定释义。执行 docs/external-ai-handoff.md，遵守仓库 AGENTS.md。

输入：
- 翻译器仓库：<实际目录；网页 AI 则说明已上传哪些文件>
- 源码根目录：<实际目录或附件根目录>
- 工程 / Target / 模块：<处理范围；不明确时先检查工程配置>
- 已有项目知识包：<文件路径或无>
- 已有额外通用技术库：<文件列表或无>
- 已有音标增强包 / ECDICT 索引：<路径或无>
- 本次反馈：<错误、漏词或无>
- 输出目录：<新的 knowledge-packs/工程名-批次 目录>

目标读者英文基础较弱，主要想知道函数、变量、参数和类型名称是什么意思。

请完成：
1. 核实输入和范围，直接按文件阅读源码，结合声明、实现、配置和必要调用位置解释名称。长文件分段读取并记录完成范围。不以搜索片段冒充完整阅读。不要求先运行符号提取器，也不要为本任务新写批量符号提取脚本。
2. 生成 project-pack.json：保留原始英文名称，写自然的中文名和一句话 summary_zh。参数放在所属函数的 parameters 中，也写 summary_zh。局部变量和业务名称保留项目作用域，同名不同作用域不合并。
3. 生成 general-terms.json：参考内置库和已有额外库，累计保存本次选定维护的额外通用词条，并加入本次新增或修正项。只提炼跨项目稳定含义；不把某个项目的特殊实现推广成通用保证。不要复制一整份内置库，也不要因为出现在源码中就把所有名称收进通用库。
4. 日常 summary_zh 只回答核心含义或用途；频率、引脚、内存大小、当前配置值、完整参数表等放在 description_zh 或报告中。类型宽度和定义所需单位保留。不要机械截断长说明生成摘要。以 config 开头且经源码确认是配置项的中文名使用“配置：具体含义”，前缀只添加一次。
5. 项目用途必须有源码依据。名称约定只能支持通用含义，不能证明当前工程行为。注释冲突、条件编译不明和缺失依赖如实记录；无法确认的内容保留 uncertainty，不编造。
6. 音标沿用已有可靠数据；有可用 ECDICT 索引时，用现有 enrich 工具从原始包生成独立增强包。缺失读法记录在清单中，有可靠依据再补；不确定时 reading=unknown。AI 新增或改写的技术库数据使用 review_status=unreviewed，不能把 AI 自查标成人工 confirmed。用户无需逐条审核，默认直接使用、有问题再反馈。
7. 运行本文的项目包与技术库校验，查看退出码并修复错误；按 scripts/README.md 对实际词库改动选择对应测试。保留来源、文件哈希、修改依据、命令及结果。不能执行的检查明确列为未执行。
8. 交付 project-pack.json、general-terms.json、manifest.json、report.md；具备音标条件时另交增强包与缺失清单。报告列出覆盖范围、项目条目数、通用新增/修正/沿用项、未泛化的典型名称及原因、冲突和未完成事项，并给出加载路径。

只修改指定输出目录，不修改源工程、内置词库或用户 VS Code 配置，不替换正式旧包，不创建 Skill。不要只交几个示例，也不要要求我逐项人工审核后才能使用。通过结构校验不等于中文语义已经核实，最终如实说明检查范围。
```

## 3. 两种文件使用不同格式

### 项目精确知识包：`project-pack.json`

沿用当前格式：根节点 `name`、`version`、`entries`；词条使用 `symbol`、`kind`、`name_zh`、`summary_zh`、`source`，按需保留 `description_zh`、`declaration`、`parameters`、`returns_zh`、`scope`、`uncertainty`。参数使用 `name`、`summary_zh`、可选 `description_zh` 和 `type`，不另造参数中文名字段。

`kind` 仅使用 `function`、`variable`、`macro`、`enum`、`typedef`。来源文件相对源码根目录，使用 `/`，行号从 1 开始。文件级符号的 `scope` 使用相对文件路径；局部变量用 `文件::函数:L声明行:C声明列`；成员用 `文件::类型`。声明与定义合并时优先引用实现，其他依据放报告。

格式示例，不代表已读取任何真实工程；实际交付必须替换成真实来源：

```json
{
  "name": "示例工程词库",
  "version": "1.0.0",
  "entries": [
    {
      "symbol": "course_board_init",
      "kind": "function",
      "name_zh": "板级初始化",
      "summary_zh": "配置开发板的时钟和基础外设，为程序运行做好准备。",
      "description_zh": "根据实际源码填写本工程初始化的资源与必要条件。",
      "parameters": [],
      "scope": "src/board.c",
      "source": { "file": "src/board.c", "line": 1 },
      "uncertainty": ""
    }
  ]
}
```

### 跨项目通用技术库：`general-terms.json`

根节点使用 `format_version: 1` 和 `entries`；中文名字段是 `translation`，不是项目包的 `name_zh`。完整名称示例：

```json
{
  "format_version": 1,
  "entries": [
    {
      "token": "board_init",
      "match": "identifier",
      "translation": "板级初始化",
      "summary_zh": "配置开发板的时钟和基础外设，为程序运行做好准备。",
      "reading": "unknown",
      "source": "external-ai:名称约定；提炼依据见 report.md",
      "review_status": "unreviewed"
    }
  ]
}
```

此处用内置已有的 `board_init` 说明格式；没有修正时无需在额外库中重复收录。真实 `source` 填写实际来源标识，报告按词条关联到工程来源、位置及提炼理由。不要把项目包的 `source` 对象直接搬过来，技术库的 `source` 必须是非空字符串。

- 完整名称使用 `match: identifier`；增加非空 `summary_zh` 才能参与当前拆词归一化与后缀推测。后缀推测至少匹配两个完整词段并优先最长后缀，结果由插件标注“名称推测”。
- 不含数字、未限定 `symbol` 的完整名称才能参与泛化。`uint16_t` 等类型保持精确匹配，保留位宽；不要把后缀 `t` 全局解释为类型。
- 缩写、单位和组成词使用现有 `exact`、`insensitive` 或 `prefix` 规则；这些 token 只能包含英文字母。不要用忽略大小写规则混合同形异义词。完整格式见[第一期指南](phase-one-guide.md#技术用语库的维护格式)。
- `reading` 为 `word` 或 `letters` 时必须有非空 `phonetic`；`unknown` 可省略音标。`silent` 仅用于确有依据的不发音命名前缀，不能用于掩盖缺失。
- `course_board_init` 可提炼出稳定的 `board_init` 约定；本工程初始化了 LED、串口、DWT，不代表其他工程也包括它们。`buffer`、`state`、`worker` 等普通名称的具体对象和业务行为留在项目包；多义且无法稳定概括时不强行泛化。
- 增量维护先读已有额外库。同一匹配条件、相同含义合并；修正项记录前后差异。确有同级多义时保留必要候选，报告说明适用语境。不要每个工程都重做一份相互覆盖的完整通用库。

## 4. 校验与音标

以下命令在翻译器仓库根目录、PowerShell 7 中执行。将示例路径换成实际路径。项目包校验器不能用来校验通用技术库。

```powershell
python -X utf8 validator/validate.py --pack '实际输出目录/project-pack.json' --src '实际源码根目录'

# 使用现有技术库校验函数，无须新增校验器
python -X utf8 -c 'import json,sys; from pathlib import Path; from phonetics.model import validate_terms; terms=validate_terms(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))); print("Technical terms validated:", len(terms))' '实际输出目录/general-terms.json'
```

结构校验不能证明释义正确、来源行准确、没有漏项或通用化合理；这些需 AI 回到源码和记录自查。`summary_zh` 在兼容格式中是可选字段，但本任务要求新制作和完善的条目及参数填写非空内容。

有 ECDICT 索引时可补项目包音标：

```powershell
python -X utf8 phonetics/tool.py enrich `
  --pack '实际输出目录/project-pack.json' `
  --dictionary '实际 ECDICT 索引目录' `
  --terms '实际输出目录/general-terms.json' `
  --out '实际输出目录/project-pack.phonetic.json' `
  --missing '实际输出目录/missing.json'
```

缺失清单用独立补充文件回填，再从原始项目包执行 `enrich --supplement`；详见[音标流程](phase-one-guide.md#ai-制包后的音标流程)。没有索引也可交付中文包与通用库，报告音标未补全。更新已有增强包时重新生成，避免中文用途与原始包不一致。当前通用完整名称的读音还会按组成词查技术库和词典，不应依赖给完整名称随意拼一个音标。

`manifest.json` 记录实际输入、Target、纳入/参考/排除文件、已读范围、实际读取文件的 SHA-256、真实 Git 版本与工作区状态（可获取时）、所用旧库、输出文件及检查结果。`report.md` 记录词条依据、通用化判断、修改和不确定项。拿不到的版本或哈希明确说明，不虚构。

## 5. 怎么加载与继续积累

1. 中文设置页的“词库管理 → 项目知识包”添加 `project-pack.json`，有增强包时改选 `project-pack.phonetic.json`。同一批次原始包与增强包选一份，避免重复候选。
2. “词库管理 → 通用技术库”添加 `general-terms.json` 的绝对路径（对应 `daiguaTranslate.technicalLibraryPaths`）。它不能放进项目知识包列表。
3. 更新后运行“呆瓜翻译器：重新加载知识包”。项目精确释义优先；额外技术库优先于内置库，同一匹配层级后配置的文件优先。多个旧版本同时加载可能遮蔽修正项，累计更新库时替换旧版本路径。
4. 下一次提供新工程时，把这份累计通用库也交给 AI，继续复用、补充和纠错。插件只读取文件，不自动把工程词条写入通用库；新增通用库通过额外文件加载即可使用，无须每次重打 VSIX。

这套流程不要求用户逐条人工审核。来源与不确定状态仍保留，默认直接使用，遇到问题再把名称、源码上下文和现有词条交给 AI 修正。
