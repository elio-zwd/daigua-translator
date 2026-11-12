# 发给外部 AI：按工程维护独立词库

适用 0.6.0。用户主要想看懂英文名称的含义。插件运行时只读取文件，不调用 AI，不需要 API Key。可在中文设置页复制本文全文。

## 1. 实际输入

发送前填写：

- 目标工程及源码根目录：<路径或压缩包>
- 要处理的模块、文件或 Target：<明确范围>
- 已有独立词库目录：<含 library.json 的目录，或首次制作>
- 稳定工程 ID：<已有则沿用；首次制作时确定>
- ECDICT 索引：<已有路径，或在清单中配置，或无>
- 本次问题：<错误、漏词、同义重复或无>
- 输出目录：<新的独立目录；不覆盖原目录>

请读取仓库 AGENTS.md、本文和现有 library.json；实际源码、已有三类词库和维护工具都需要可访问。无法访问的本地路径不代表已经读取。日常更新可参考旧库，但必须回到源码核实。

## 2. 可直接交给 AI 的任务

请根据以上输入完成词库更新，遵守以下规则：

1. 确认范围并按文件直接阅读源码，结合实现、声明、配置和必要调用位置解释名称。长文件分段读取，记录已读范围和缺失依赖。不以搜索片段冒充完整阅读，不新写批量符号提取脚本作为前置条件。
2. 在指定输出目录生成完整、可选择的独立词库目录。已有库中本次未修改的启用文件原样沿用，保留稳定工程 ID；将新增或修正数据归入下述三类，不再制作插件内置库。
3. words/ 只保存词语释义：英文词、缩写、专业术语，例如 GPIO、buf、CMD。缩写和专业术语有交集，不分两份重复维护。同类已有条目沿用，真正修正时保留来源和修改依据。组织专用缩写必须说明适用背景；不把猜测改成用户确认。
4. naming/ 保存完整名称和命名规则，例如 board_init、uint16_t、FreeRTOS 前缀。只提炼稳定约定，不把本工程的 LED、串口、频率或其他配置推广成所有工程的保证。单字母规则必须限制位置或完整名称，不能把所有 t 都解释为类型后缀。
5. symbols/<工程ID>/ 保存实际源码符号。沿用 project-pack.json 格式，为函数、变量、参数、类型、宏和枚举提供中文名及一句话 summary_zh。同名不同作用域保留区别；参数放在所属函数的 parameters 中。不把其他工程的行为当作本工程已经确认的行为。
6. 在 library.json 中登记三类启用文件、工程名称、稳定 ID 和实际源码根目录。普通词库路径相对目录，源文件路径相对源码根目录。同一批次原始包和增强包只启用一份，报告与补充清单不要列入运行清单。多个工程的源码库可以同时启用，供跨工程参考。
7. 日常释义只回答名称是什么意思：自然的中文名、一句话核心用途。频率、引脚、内存大小、声明、参数表、返回值和位置放 description_zh 或报告。类型宽度和必要单位保留。不要机械截断长说明。经源码确认的 config 配置项中文名使用“配置：具体含义”，前缀只加一次。
8. 同义整理以源码证据为依据。插件只按相同符号类型、必要所属函数、中文名和一句话用途做文字去重；近义改写需要你核实后统一措辞，不丢弃不同工程的来源、审核状态和不确定性。无需用户逐条人工审核，默认可用，有问题再反馈。
9. 音标沿用可靠数据；有 ECDICT 索引时使用现有 enrich 工具生成独立增强包。无法确认的保留 reading=unknown；不编造读音。AI 新增或改写数据使用 review_status=unreviewed，不能把自查改成 confirmed。用户已经确认的含义保留原有确认来源。
10. 校验全部启用文件，查看退出码后修复错误；保留实际输入输出、源码文件哈希、版本信息、命令和结果。不能执行的检查明确标为未执行，结构校验不等于语义核实。

只写指定输出目录，不修改源工程、原词库或用户 VS Code 配置，不创建 Skill。保留旧数据作为追溯资料。交付可直接选择的完整目录、更新说明和明确的加载路径。

## 3. 清单与三类文件格式

library.json：

```json
{
  "format_version": 1,
  "word_libraries": ["words/code-terms.json"],
  "naming_libraries": ["naming/conventions.json"],
  "dictionary_path": "M:/数据/ECDICT/daigua-index",
  "projects": [
    {
      "id": "firmware-a",
      "name": "固件 A",
      "source_roots": ["M:/代码/firmware-a"],
      "symbol_libraries": ["symbols/firmware-a/project-pack.phonetic.json"]
    }
  ]
}
```

`dictionary_path` 可省略；可引用已有外部 ECDICT 索引，不复制完整词典。源码根目录可关联多个目录；无法确定时 `source_roots: []`，按跨工程参考使用。旧包格式保持兼容；同一文件只启用一次。

词语释义文件：

```json
{
  "format_version": 1,
  "entries": [
    {
      "token": "CMD",
      "match": "insensitive",
      "expansion": "command",
      "translation": "命令",
      "reading": "unknown",
      "source": "external-ai:填写实际依据",
      "review_status": "unreviewed"
    }
  ]
}
```

词语库的 match 只使用 exact、insensitive。命名库使用相同文件格式，但 match 只使用 prefix、identifier；prefix 仅在现有命名前缀位置规则允许时生效。需要限定某个名称时可用 symbol。source 为非空字符串，reading 为 word、letters、silent、unknown；word、letters 必须有非空 phonetic。来源和实际读法必须有依据。

命名库的完整名称示例：

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
      "source": "external-ai:填写实际依据",
      "review_status": "unreviewed"
    }
  ]
}
```

跨项目名称推测只使用带 summary_zh、无限定 symbol、不含数字的完整名称规则，按完整词段匹配；不扩大整数类型或单字母规则。前缀、单位等的词义规则和音标要与真实使用方式一致。

源码符号文件（示例不代表已读任何真实工程）：

```json
{
  "name": "固件 A 源码符号库",
  "version": "1.0.0",
  "entries": [
    {
      "symbol": "worker",
      "kind": "function",
      "name_zh": "工作任务",
      "summary_zh": "执行本工程的周期性处理。",
      "source": {"file": "src/main.c", "line": 12},
      "scope": "src/main.c",
      "parameters": [
        {"name": "arg", "summary_zh": "传入任务的配置参数。", "type": "void *arg"}
      ]
    }
  ]
}
```

kind 仅使用 function、variable、macro、enum、typedef。参数使用 name、summary_zh、可选 description_zh 和 type，不另造中文名字段。声明和定义合并时优先引用实现，补充证据放报告。文件级 scope 使用相对路径，局部变量用 `文件::函数:L声明行:C声明列`，成员用 `文件::类型`。同名不同作用域不合并。

## 4. 工具、校验与交付

在仓库根目录使用 PowerShell 7、Python 3.10+：

```powershell
python -X utf8 validator/validate.py --library '<输出目录>'
python -X utf8 validator/validate.py --pack '<输出目录>/symbols/<工程ID>/project-pack.json' --src '<源码根目录>'
python -X utf8 phonetics/tool.py enrich --library-dir '<输出目录>' --pack '<原始源码包>' --out '<独立增强包>' --missing '<缺失清单>'
```

没有可靠索引时不运行 enrich，也不宣称补齐音标。制作报告和缺失清单可放 maintenance/，不加入清单。enrich 不修改原包已有中文，增强后更新清单指向增强包。按 scripts/README.md 选择实际改动需要的测试。

交付包含 library.json、全部启用数据和 report.md。报告列明源码覆盖范围、三类新增/修正/沿用项、不能泛化的名称、重复释义整理、原始不确定项、实际哈希和校验结果。

用户在设置页选择输出目录即可加载。源码先按目录识别本工程，优先显示本工程释义，其他工程最多再显示 3 条不同释义；没有本工程数据时显示参考。插件不自动把参考解释写成本工程成果，后续有空时再由外部 AI 阅读源码完善。
