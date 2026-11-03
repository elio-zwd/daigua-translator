# 呆瓜翻译器 (daigua-translator)

> 面向 MCU C/C++ 单片机开发的代码翻译工具，作为 MTranCode 自定义翻译服务使用。

## 核心设计与使用流程

1. **日常翻译**：在 MTranCode 中发起翻译，优先查询已加载的本地知识包。
   - **精确命中**：直接显示本地整理好的中文释义、函数声明、参数/返回值及源码出处，不发起任何网络请求。
   - **未命中/普通长文本**：自动回退至 MTranCode 自带的 Bing 翻译。
   - **无在线 AI 依赖**：插件运行时纯本地运行，不配置任何 API Key 或模型地址。
2. **知识包制作**：由 AI 编程工具协同制作：
   - 运行本地提取脚本 `extractor/extract.py` 扫描 MCU 工程（如 Keil `.uvprojx`），提取函数、变量、宏等事实。
   - AI 根据提取事实与源码逐批编写中文名称、功能说明与参数释义。
   - 运行校验工具 `validator/validate.py` 检查格式与重复项，导出标准知识包 JSON。

---

## 目录结构

```
daigua-translator/
├── plugin/                     # MTranCode 自定义翻译服务插件 (TypeScript / VS Code Extension)
│   ├── src/
│   │   ├── types.ts            # 数据结构定义与 ITranslate 接口规范
│   │   ├── knowledge-loader.ts # 知识包异步加载与查找
│   │   ├── symbol-matcher.ts   # 符号匹配、剥离 () 与中文输出排版格式化
│   │   ├── daigua-translate.ts # 核心翻译服务 (本地优先 + Bing 回退)
│   │   └── extension.ts        # VS Code 扩展入口与 MTranCode 服务注册
│   ├── package.json
│   └── tsconfig.json
│
├── extractor/                  # MCU 源码事实提取工具 (Python 3)
│   └── extract.py              # 支持 Keil .uvprojx 解析、Doxygen 注释提取、函数体捕获、全局变量过滤
│
├── validator/                  # 知识包规范校验与导出工具 (Python 3)
│   └── validate.py             # 必填项、合法类别、同作用域重复项、源码文件存在性检查
│
├── knowledge-packs/            # 知识包目录
│   ├── example/
│   │   └── example-pack.json   # 基础示例知识包
│   └── 05_createtask-pack.json # 基于真实 FreeRTOS 课程工程制作的示范知识包
│
├── docs/                       # 方案与制作说明
│   ├── spec-v0.2.md            # 方案设计草稿
│   └── knowledge-pack-guide.md # 知识包制作操作指南
│
├── scripts/                    # 测试与验证脚本
│   └── test-plugin.js          # 本地匹配与 Bing 回退端到端快速测试脚本
│
└── README.md
```

---

## 快速使用与验证命令

### 1. 验证与编译翻译插件 (plugin)

```powershell
cd plugin
npm install
npm run compile
npm test
```

运行快速测试脚本（验证本地命中与 Bing 翻译回退）：

```powershell
$env:NODE_PATH="M:\005869\My_Elio\daigua-translator\plugin\node_modules"
node scripts\test-plugin.js
```

### 2. 运行源码提取工具 (extractor)

支持传入 Keil `.uvprojx` 工程文件（自动解析编译文件列表与 Include 目录），或者直接指定源码目录：

```powershell
python extractor\extract.py `
  --proj "M:\005869\My_Elio\FreeRtos\projects\freertos-learning\05_createtask\mdk_v5\course.uvprojx" `
  --out "extractor\out" `
  --include-drivers
```

提取产物位于 `extractor/out/`：
- `functions.json`（函数名、返回类型、参数列表、实现体、Doxygen 注释、源码位置）
- `variables.json`（静态/全局变量、类型、源码位置）
- `macros.json`（宏定义、枚举常量、枚举类型）
- `uncertain.json`（待确认项目）
- `extract_summary.txt`（提取文件数与各符号统计）

### 3. 校验知识包 (validator)

```powershell
python validator\validate.py --pack "knowledge-packs\05_createtask-pack.json"
```

可选参数：
- `--src <源码目录>`：检查词条中引用的源文件是否真实存在
- `--out <导出路径>`：校验通过后导出格式化压缩的 JSON

---

## 给后续 AI / 开发者的交接清单

基础设施具备基本实现，但实际宿主集成、缓存、VSIX 安装尚未完全验收。参见 [集成验收说明](docs/mtrancode-integration.md)。后续可在此基础上开展：

1. **批量生成工程知识包**：
   - 提取产物已生成于 `extractor/out/`。
   - 读取 `functions.json`、`variables.json`，让 AI 批量为更多模块生成中文释义，填入并扩充 `knowledge-packs/` 下的 JSON 文件。
2. **VS Code 插件调试与安装**：
   - 在 VS Code 中打开 `plugin/` 目录，按 `F5` 启动扩展开发宿主窗口。
   - 在 MTranCode 设置中将翻译源切换为 `呆瓜翻译器（本地知识包）`。
   - 在配置项 `daiguaTranslate.packPaths` 中配置生成的知识包 JSON 绝对路径。
