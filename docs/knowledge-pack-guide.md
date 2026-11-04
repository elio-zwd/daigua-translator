# AI 制作与人工复核知识包

插件运行时不使用 AI。制作阶段按以下顺序进行：

1. 扫描目标工程。共享源码场景指定 `--root`，局部候选使用 `--include-locals`。先读 `uncertain.json`，再按文件阅读草稿。
2. **AI 先筛选**候选，根据源码填写中文、参数、返回值和限制；排除项记录原因。复杂结构可回看源码后补录并注明来源。
3. **人工再筛选和复核**收录及排除结果。没有依据的推断不能写成事实。每项人工状态初始为 `pending`，只有人确认后才改为通过或退回。
4. 校验器的 `--src` 与提取器的 `--root` 使用同一目录，通过后可 `--out` 导出。警告不等于已确认。
5. 配置 JSON 绝对路径。验证未查过的本地词条、同名候选和 Bing 回退；已查词条的更新单独记录缓存表现。

```powershell
python extractor/extract.py --proj 'D:\MCU\05_createtask\mdk_v5\course.uvprojx' --root 'D:\MCU' --include-locals --out extractor/out/05_createtask
python validator/validate.py --pack knowledge-packs/05_createtask-pack.json --src 'D:\MCU' --out ready.json
```

正式包沿用五种类别，局部变量仍为 `variable`，保留文件、函数和声明位置构成的 `scope`，不要按名称直接合并。函数体和邻近代码等草稿字段不必写入正式包。

05 的[候选清单](../knowledge-packs/reviews/05_createtask-review.md)及同目录 JSON 保存 AI 决定、来源、排除原因、人工状态、提交号和文件哈希。`source_version` 是制作时真实提交号，哈希描述实际文件快照，不将提交号当作工作区无修改的证明。

更新时重新提取受影响文件，AI 对照旧词条修改，把相关人工状态恢复为待复核，再校验和加载。翻译源 ID 保持稳定；宿主已缓存文本可能继续返回旧内容，不能宣称所有历史查询已经更新。
