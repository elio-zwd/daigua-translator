# 手工验收：VS Code + MTranCode

自动验证先于 VSIX 打包。界面、安装、实际断网与物理板卡由用户手动验证；本次没有通过自动控制电脑替代用户验收。所有下列人工项目初始均为“待验证”。

## 准备

1. 安装构建产物 `plugin/daigua-translator.vsix`，确认 VS Code 已安装 MTranCode。当前本机参考版本是 VS Code 1.107.1、MTranCode 3.0.3。
2. 在仓库根目录执行 `pwsh -NoProfile -File scripts/prepare-manual-demo.ps1`。它只复制示例到一个新的 `dist/manual-demo-时间戳/` 目录，不启动软件、不修改设置。
3. 复制脚本打印的 `daiguaTranslate.packPaths` 配置到测试工作区，打开该目录中的 `main.c`。将目标语言设为简体中文，在 MTranCode 中选择“呆瓜翻译器（本地知识包）”。
4. 只修改该目录里的 `pack.json` 测试副本。**暂时不要查询 `reload_probe_count` 和 `retained_probe_count`**，后续使用首次查询区分插件重载和宿主缓存。

## 按顺序验证

| 项目 | 手工操作 | 预期结果 | 状态 |
|---|---|---|---|
| 安装与注册 | 使用 MTranCode 原有入口查询 `Motor_Start()` | 能选中呆瓜翻译源，显示“启动电机演示”、参数 speed、返回值及 main.c 来源 | 待验证 |
| 首尾空白与大小写 | 查询 ` Motor_Start() `，再查询 `motor_start` | 前者本地命中；后者不误命中，会回退 Bing，联网时结果可能只是普通词语翻译 | 待验证 |
| 更新新查询 | 修改 pack.json 中 reload_probe_count 的 name_zh 为“重载探针新版本”，运行重载命令，再首次查询它 | 提示加载成功 1 个包、4 条词条；显示“新版本” | 待验证 |
| 旧查询缓存 | 修改 Motor_Start 的中文名，重载后再次查完全相同的 Motor_Start() | 记录实际显示；可能继续返回旧释义，这是已知宿主限制，不标记为缓存问题已解决 | 待验证 |
| 坏包保留 | 暂时将 pack.json 改成不合法 JSON 或把一个词条改为 null，运行重载，再首次查 retained_probe_count | 提示含失败路径、保留旧包 1 个；输出通道有错误原因；未查过的保留探针仍本地命中，不是单靠宿主旧缓存 | 待验证 |
| 修复恢复 | 恢复合法 JSON 并重载 | 显示成功 1 个包、保留旧包 0 个；输出不再报该包失败 | 待验证 |
| 首次加载坏包 | 在路径数组追加一个不存在的 JSON 绝对路径 | 正常包继续有效，不存在的路径显示失败且跳过，不谎报全部成功 | 待验证 |
| 多包歧义 | 移除坏路径，追加脚本打印的 ambiguity-pack.json；查询此前未查过的 `Motor_Start( )` 变体 | 显示两个候选及各自 scope/来源，不自动选定其中一个；如宿主规范化缓存导致结果复用，另开测试工作区重试并记录 | 待验证 |
| 移除路径 | 从设置移除演示包，只留歧义包；查询新的未缓存变体 | 配置自动生效，仅显示第二包的说明；不要只用先前缓存的文本判断 | 待验证 |
| 真实工程包 | 将路径改成 knowledge-packs/05_createtask-pack.json 的绝对路径；查询 worker()、intervals、local_count | 显示任务说明、周期数组和局部计数；来源分别指向 05_createtask/src/main.c 的实际位置 | 待验证 |
| 实际断网本地查询 | 保持真实工程包加载，手动断开网络，再首次查 board_ready、course_last_fault | 本地成功；说明分别是输出就绪标志和原因/文件/行号故障记录，不宣称寄存器快照 | 待验证 |
| 实际断网未命中 | 仍断网，查询此前没查过的普通英文句子，例如 `This is a fresh offline acceptance sentence 20261104.` | 显示翻译失败，不能把错误文本当成功译文。库重试可能需要等待 | 待验证 |
| 联网恢复与完整回退 | 恢复网络，查询新句子 `Explain worker() and preserve this entire sentence.` | 整段中文翻译，不只返回 worker 词条，不需要手动切换源；Bing 结果不写入 JSON | 待验证 |

## 知识包与物理工程复核

- 对照 [149 项候选清单](../knowledge-packs/reviews/05_createtask-review.md)检查 AI 收录和排除理由，以及 [75 条中文词条](../knowledge-packs/05_createtask-pack.json)的语义、参数、返回值和来源；实际复核后再更新逐项人工状态。
- 执行 `python scripts/check-05-pack.py --src 'D:\FreeRtos\projects\freertos-learning'`，应显示来源快照一致；源码变化则先重新制作，不能忽略哈希不一致。
- 若验证实体板卡：按原课程流程构建、烧录并观察两个任务约 500/1000 ms 的日志周期，检查板型、时钟、串口和 LED 配置；这只能证明实际观察到的行为。不要为了翻译器验收主动触发硬故障。
- 默认 COURSE_KEY_INDEX 为 0，候选按键接线和极性尚未确认。只有按课程完成引脚探测后才能把相应词条的硬件待确认项改为通过；这不阻止对其代码行为的复核。

## 已知限制与结果填写

MTranCode 在调用自定义翻译器前可能先命中持久化缓存。插件能更新活动实例，但没有公开的宿主缓存清理接口；切换源或重载窗口不保证清除。Issue #1 保持未解决。本插件不修改宿主安装文件或缓存数据库。

Bing 回退在本插件内执行，复用同一 npm 库和语言映射，不调用宿主内部翻译器，也不声称继承其私有设置。真实 Bing 联网示例通过与实际宿主 UI 通过是两项独立结论。

请记录：系统/VS Code/MTranCode/VSIX 版本、测试时间、对应步骤、实际结果、错误提示。人工通过前保持“待验证”；本次自动结果见 [构建前验证记录](acceptance-2026-11-04.md)。
