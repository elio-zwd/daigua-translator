# 首版候选验证记录（2026-11-04）

状态：代码、示例自动验证和 VSIX 候选构建完成；用户手工验收与人工语义复核尚未完成。先完成自动验证，再打包。未发布 Marketplace，未修改 MTranCode 安装文件或宿主缓存。

## 本机环境

- Windows 10 专业版 x64，10.0.19045。
- Node.js v24.16.0，Python 3.14.3，PowerShell 7。
- 本机已安装 VS Code 1.107.1、MTranCode 3.0.3，仅作为手工验收参考；本次未通过操控界面完成宿主验收。
- CI 配置为 Node.js 22 的 Windows/Linux 验证先通过才允许打包；Python 工具另有 3.10/3.12 矩阵。本次新增 CI 尚未推送运行，不把配置存在视为远端验证通过。

## 自动结果

| 检查 | 结果 |
|---|---|
| Python 工具测试 | 18/18 通过 |
| TypeScript 编译与插件测试 | 37/37 通过，含两端共享格式用例、坏包整包拒绝、保留旧包、移除路径和重载竞争 |
| 最小 MCU 示例 | 提取 1 个函数、4 个变量候选，来源校验通过 |
| 示例离线查询 | worker()、intervals、Motor_Start、local_count 均命中，无网络调用 |
| 离线未命中 | 模拟 transport 抛错，查询失败；不代表实际物理断网验收 |
| 多包歧义 | 两个 Motor_Start 候选均显示 |
| 真实 Bing 请求 | 英文 The motor starts after initialization. 返回“电机在初始化后启动。” |
| 真实 05 工程扫描 | 13 个文件，38 个函数、28 个变量候选、80 个宏/枚举/类型候选；6 项扫描待确认记录 |
| 05 来源校验 | 75 条词条，0 错误、18 个硬件待确认警告；14 个来源/工程文件哈希一致 |
| AI 候选筛选 | 149 项候选，其中含 3 项回看源码补录；收录 75 项、排除 74 项，149 项人工状态均 pending |
| npm ci 与 audit | 锁文件安装成功，审计 0 漏洞；vsce 的 minimatch 固定覆盖到 11.0.1 |
| VSIX 内容检查 | 编译入口、内部 Bing 模块、校验模块与 Bing 生产依赖齐全；测试和打包工具未进入 VSIX |
| VSIX 解包运行检查 | 从产物解包后的模块读取 75 条包，worker() 离线查询成功；没有安装插件 |

测试日志里的 Bing offline、空译文和拒绝导出信息属于预期失败场景，不是测试失败。打包工具还提示仓库没有许可证文件；本轮只构建本地候选，不替项目选择发布许可证。

## 复现命令

在仓库根目录执行：

```powershell
npm --prefix plugin ci
pwsh -NoProfile -File scripts/verify.ps1 -Online -SourceRoot 'D:\FreeRtos\projects\freertos-learning'
npm --prefix plugin run package
python scripts/check-vsix.py plugin/daigua-translator.vsix
```

## 候选产物

- 文件：`plugin/daigua-translator.vsix`
- 插件版本：`0.2.0`
- 大小：`758106` 字节
- SHA-256：`5efe782903c8c8d9eda89f5cbc5f430cc2d80a1713be81eb823fec429337f962`
- 中文包：`knowledge-packs/05_createtask-pack.json`，包版本 1.1.0。
- 候选与哈希：`knowledge-packs/reviews/05_createtask-review.json`。
- 人工清单：同目录 `05_createtask-review.md`。

## 等待用户验证

安装与翻译源选择、实际宿主查询、实际断网及恢复、重载探针、坏包保留、路径变更、多包歧义、中文语义复核和需要时的实体板卡行为，均保持待验证。具体操作及预期结果见 [手工验收表](mtrancode-integration.md)。

宿主已经缓存过的文本可能继续返回旧内容，Issue #1 仍未解决。按键候选接线及极性未核实，不将代码说明当作板卡实测结论。
