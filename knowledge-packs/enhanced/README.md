# 05 工程音标增强样本

基于 `../05_createtask-pack.json` 的 75 条词条生成。原始中文、参数说明、源码引用与人工复核状态未改写。

- `05_createtask-pack.phonetic.json`：可直接由插件读取的增强包。
- `05_createtask-missing.initial.json`：第一次补充后，按大小写片段去重的 12 项缺失／待确认清单，保留全部出现位置。
- `05_createtask-supplement.json`：Codex 为其中 9 项编写的 AI 补充，带 `external-ai:Codex-2026-11-09` 来源及 `unreviewed` 状态。
- `05_createtask-missing.json`：回填后剩余的 3 项。Malloc、MALLOC、SYSCALL 的读法继续待确认，没有强行选择。
- `ECDICT-LICENSE`：本增强样本使用的 ECDICT 数据许可证。CSV 来源、哈希及工具命令见[第一期指南](../../docs/phase-one-guide.md)。

增强包含 242 个读音片段：234 个已找到或补充读法，5 个数字片段跳过，3 个待确认。“已找到读法”不代表已人工核实发音。初始技术库和 AI 补充仍待人工复核；原始包中的 18 项用途不确定说明保持不变。

脚本不自动调用 AI。外部 AI 可在制包后调用脚本，并根据清单维护独立补充文件；有多种约定读法时保留候选或待确认。以后重新生成时使用原始包，而不是手工改写中文增强包。
