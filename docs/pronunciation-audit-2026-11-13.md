# 音标缺失检查（2026-11-13）

范围：`dictionaries/library.json` 启用的词语、命名及源码符号库。本次按已有字段检查，不把数字跳过、命名前缀的 `panel_only`、或约定不发音当成缺少英文读音。联网翻译结果不属于固定词库，无法穷举。后续查询可从已启用词库补充源码词条缺失的、能可靠对应的片段，因此源码文件中的待补记录不一定等于界面实际显示的缺失。

## 查询路径

本机配置的 ECDICT 索引已有 `static` 的音标 `/ˈstætik/`（索引原文为 `'stætik`）。此前联网翻译结果没有查询本地音标，因此普通名称即使在词典中有音标，也可能显示“音标暂缺”。现已让联网名称查询使用已启用的本地词语库和 ECDICT 音标；完整句子不拆成标识符读音。无法查到或读音存在歧义时继续显示缺失。

## 源码符号库中待补充的读音

| 工程 | 源码名称 | 缺失片段 |
| --- | --- | --- |
| FreeRTOS 学习工程 | `vApplicationMallocFailedHook` | `Malloc` |
| FreeRTOS 学习工程 | `configUSE_MALLOC_FAILED_HOOK` | `MALLOC` |
| FreeRTOS 学习工程 | `configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY` | `SYSCALL` |
| DFU 固件升级工程 | `crc32_update` | 整个名称未提供音标 |
| DFU 固件升级工程 | `parse_frame` | 整个名称未提供音标 |
| EK BLE CH-BLE 蓝牙工程 | `MARK_CODE_BOOTLOAD` | `BOOTLOAD` |
| EK BLE CH-BLE 蓝牙工程 | `START_CODE_BOOTLOAD` | `BOOTLOAD` |

FreeRTOS 的参数 `...` 是省略参数标记，没有单词音标。数字片段标记为跳过，不计入上表。表格只记录源码包中明确待补或未提供的读音，未自动推测或改写读法。

## 词语和命名库的未知读法字段

词语库中 `reading: unknown`：`EK`、`uint`、`malloc`、`syscall`、`SWD`、`IWDG`、`rwip`、`RDTSS`。它们的实际读法依赖上下文，不能仅凭词义确定。

命名库中完整名称条目的 `reading: unknown`：`int8_t`、`int16_t`、`int32_t`、`int64_t`、`uint8_t`、`uint16_t`、`uint32_t`、`uint64_t`、`board_init`、`system_clock_config`、`led_set`、`led_toggle`、`uart_write`、`uart_read`、`parse_frame`、`encode_frame`、`get_state`、`crc32_update`。其中有些名称在查询时可以逐词从词典或词语库取得读音，因此字段未知不等于界面一定完全没有音标；数字或未核实片段可能仍显示部分缺失。`g`、`m`、`p`、`s` 是面板说明用途的命名前缀，不根据前缀约定猜测其读音。

上述清单为本次检查快照，后续词库变化后需要重新统计。
