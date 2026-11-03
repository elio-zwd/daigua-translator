# 呆瓜翻译器

> MCU C/C++ 代码翻译工具，作为 MTranCode 自定义翻译服务使用。

## 项目简介

在 MTranCode 中翻译单片机代码时，优先从本地知识包中查询已整理的中文说明；  
未命中时自动回退到 MTranCode 自带的 Bing 翻译，无需用户手动切换。

知识包由 Antigravity / Codex 等 AI 编程工具协助制作，不接入在线 AI 运行时服务。

## 目录结构

```
daigua-translator/
├── plugin/            # MTranCode 自定义翻译插件
├── extractor/         # 源码提取工具（提取函数、变量、宏等）
├── validator/         # 知识包格式校验与导出工具
├── knowledge-packs/   # 知识包存放目录
│   └── example/       # 示例知识包
├── docs/              # 文档（制作说明、接口说明等）
├── scripts/           # 辅助脚本
└── README.md
```

## 交付物

| 组成 | 说明 |
| --- | --- |
| `plugin/` | MTranCode 自定义翻译插件，读取本地包，未命中回退 Bing |
| `extractor/` | 本地运行的源码提取脚本，输出中间文件供 AI 整理 |
| `validator/` | 知识包格式校验、重复词条检查、导出工具 |
| `knowledge-packs/example/` | 示例知识包，验证完整流程 |
| `docs/` | 知识包制作说明、使用说明 |

## 参考项目

- [MTranCode](https://github.com/xxnuo/MTranCode) — 宿主翻译工具
- [pot-app-translate-plugin-programmer-selection](https://github.com/elio-zwd/pot-app-translate-plugin-programmer-selection) — 参考标识符处理与失败回退思路

## 方案文档

见 `docs/spec-v0.2.md`（来自草稿文档）。
