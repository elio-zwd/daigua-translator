# 独立词库

在插件设置页选择本目录。插件只加载 `library.json` 清单启用的文件，词库不随 VSIX 安装。

- `words/`：词语释义，包括缩写、专业术语和 EK 的组织名称解释。
- `naming/`：完整名称与命名规则。
- `symbols/`：工程源码符号解释，每个工程只启用一份正式版本。

源码根目录来自已有工程记录；工程移动后修改 `library.json` 中的 `source_roots`。本机 ECDICT 路径通过 `dictionary_path` 引用，可修改或移除；不会复制完整词典。

`migration-report.json` 保存迁移输入及哈希，不参与运行时加载。历史原始数据保留在仓库的 `knowledge-packs/`，不再作为当前维护文件。

完整格式、迁移命令和跨工程展示规则见 [0.6.0 说明](../docs/library-directory-0.6.0.md)。
