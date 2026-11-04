# 呆瓜翻译器

面向 MCU C/C++ 的 MTranCode 翻译源：优先查询本地知识包，未命中时使用与 MTranCode 相同的 `bing-translate-api` 库请求 Bing。运行时不调用 AI，不需要模型地址或 API Key。

当前为首版候选实现，自动验证已具备。真实 VS Code/MTranCode、实际断网和硬件行为由用户手动验收，知识包中文仍待人工复核。已查询文本可能受宿主持久化缓存影响，详见[验收步骤与记录](docs/mtrancode-integration.md)。

## 安装与使用

1. 在 VS Code 安装 MTranCode，再选择“从 VSIX 安装”安装本插件。
2. 将 `daiguaTranslate.packPaths` 设为知识包 JSON **绝对路径**数组。
3. 从 MTranCode 的 Change translation source 选择“呆瓜翻译器（本地知识包）”。
4. 查询 `worker()`、`intervals` 或 `local_count`，查看中文、参数和来源。未收录内容完整回退 Bing。

“呆瓜翻译器：重新加载知识包”更新活动翻译器，路径配置变化也会重载。坏包整体拒绝；重载失败保留该路径上一次有效内容，移除路径立即移除该包。提示显示成功包数、有效词条数和失败路径，详细原因见“呆瓜翻译器”输出通道。

## 开发与验证（Win10 x64）

需要 PowerShell 7、Node.js 22+ 和 Python 3.10+。在仓库根目录执行：

```powershell
npm --prefix plugin ci
pwsh -NoProfile -File scripts/verify.ps1
# 可选：联网示例与本机真实工程快照核对
pwsh -NoProfile -File scripts/verify.ps1 -Online -SourceRoot 'D:\FreeRtos\projects\freertos-learning'
```

验证通过后再打包：

```powershell
npm --prefix plugin run package
```

产物为 `plugin/daigua-translator.vsix`。打包命令先执行插件测试和离线示例，再运行固定版本的 vsce；完整 Python 检查请先执行验证脚本。脚本不操作电脑界面、不安装插件、不发布 Marketplace。

## 制作知识包

```powershell
python extractor/extract.py --proj 'D:\FreeRtos\projects\freertos-learning\05_createtask\mdk_v5\course.uvprojx' --root 'D:\FreeRtos\projects\freertos-learning' --include-locals --out extractor/out/05_createtask
# AI 根据草稿和源码筛选、编写，再由人工复核
python validator/validate.py --pack knowledge-packs/05_createtask-pack.json --src 'D:\FreeRtos\projects\freertos-learning'
```

05 工程包包含 75 条 AI 初筛词条，覆盖任务、共享板级代码、关键配置及部分局部状态。[149 项候选清单](knowledge-packs/reviews/05_createtask-review.md)记录收录、排除原因、来源和人工状态。按键接线未核实，相关条目保留待确认说明。

提取器是启发式扫描器，不能完整解析 C/C++。复杂语法和条件编译须回看源码，`uncertain.json` 不能保证列出全部遗漏。结构校验不证明中文语义正确。

- [提取器说明](extractor/README.md)
- [校验器说明](validator/README.md)
- [AI 制包与人工筛选](docs/knowledge-pack-guide.md)
- [手工验收与缓存限制](docs/mtrancode-integration.md)
- [方案规格](docs/spec-v0.2.md)

目录：`plugin/` 插件，`extractor/` 提取器，`validator/` 校验器，`knowledge-packs/` 知识包和复核记录，`examples/mcu-demo/` 可复现示例，`tests/` 和 `scripts/` 自动验证。
