# 呆瓜翻译器

![呆瓜翻译器 MCU 代码翻译形象](docs/assets/daigua-mcu-illustration.png)

面向 MCU C/C++ 的独立 VS Code 插件，帮助理解英文函数、变量和参数。0.5.0 提供简明悬停、可锁定的查词面板、中文设置页与通用名称释义，并保留选区翻译、离线词典和音标。无需 MTranCode，运行时不调用 AI，不需要 API Key。

## 安装与使用

1. 从 VSIX 安装 `plugin/daigua-translator.vsix`，重新加载窗口。
2. 运行“呆瓜翻译器：选择知识包文件”，选择旧包或 `knowledge-packs/enhanced/05_createtask-pack.phonetic.json` 增强样本。
3. 在 C/C++ 名称上悬停，查看中文名、一句话用途与音标；右键可“翻译选区或当前名称”，命令面板可“输入文本翻译”。
4. 右键“在面板中查看”可固定查词；点击状态栏打开中文设置页，可选择自动联网／ECDICT 词典／关闭未收录名称释义，或关闭联网总开关。
5. 离线词典索引配置为 `M:\005869\My_Elio\ECDICT\daigua-index`（本机已生成）；其他电脑按指南从自己的 CSV 生成。

项目知识包优先，其次查通用词库；推测复用显示“名称推测”。来源编号和实现细节放到默认关闭的调试模式。联网失败或关闭联网后，名称可以查离线词典；普通句子需要联网。旧包无须迁移；缺少简明用途时仅显示中文名，缺少音标时显示“音标暂缺”。

新版界面与无鼠标验证见[0.5.0 使用与验证](docs/concise-lookup-0.5.0.md)。完整操作、设置、命令及 AI 音标补充流程见[第一期使用指南](docs/phase-one-guide.md)。[0.4.0 历史验证记录](docs/acceptance-2026-11-09.md)保留自动检查和真实宿主检查结果；[0.4.1 反馈调整](docs/feedback-0.4.1.md)记录直接使用、按反馈改进的约定。

## 开发与验证（Windows 10 x64）

测试目录分工、按改动选择检查、CLI 执行顺序和报告位置统一见 [测试工具与验证方法](scripts/README.md)。

需要 PowerShell 7、Node.js 22+、Python 3.10+。在仓库根目录执行：

```powershell
npm.cmd --prefix plugin ci
pwsh.exe -NoProfile -File scripts/verify.ps1
# 可选：在隔离配置中验证本机真实 VS Code 扩展宿主
pwsh.exe -NoProfile -File scripts/test-vscode.ps1
# 可选：真实 Webview 三类主题、窄面板、交互与截图（不操作鼠标或键盘）
node scripts/test-ui.cjs
npm.cmd --prefix plugin run package
python -X utf8 scripts/check-vsix.py plugin/daigua-translator.vsix
```

可选 `verify.ps1 -Online` 只发送一个普通英文句子测试 Bing。测试与打包不会自动安装插件或发布 Marketplace。

## 知识包与音标

优先让外部 AI [直接阅读源码制包](docs/ai-direct-read-plan.md)，再调用 `phonetics/tool.py enrich` 补音标。ECDICT 索引只需用 `phonetics/tool.py index` 生成一次。未找到的词及不确定读法导出清单，由外部 AI 回填，仍不确定的保留缺失。始终保留原始 JSON，不改已有中文说明。

常见 MCU 缩写、单位和读法存入 `plugin/resources/technical-terms.json`；可用额外文件补充，便于持续完善。默认直接使用，有问题再反馈，无须逐条人工审核；保留来源和缺失记录。ECDICT 子集样本附带许可证。

- [制包与复核说明](docs/knowledge-pack-guide.md)
- [提取器（可选辅助工具）](extractor/README.md)
- [校验器](validator/README.md)
- [项目目的与发展规划](docs/project-purpose-and-roadmap.md)

旧版 MTranCode 集成归档在 `archive/mtrancode-v0.3`，基线 `f8910af`。历史文档保留用于查阅，主线不再提供该集成。本期增加基础词库文件管理；上下文自动消歧与源码定位仍属于后续方向。
