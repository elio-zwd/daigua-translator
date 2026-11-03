# 知识包制作说明

本文告诉 Antigravity 或 Codex 怎样为一个 MCU 工程制作知识包。

## 第一步：运行提取工具

在 Antigravity / Codex 中打开 MCU 工程目录，执行：

```
python extractor/extract.py --src <工程目录> --out <中间文件输出目录>
```

提取工具会扫描所有 `.c` / `.h` 文件，输出以下中间文件：

- `functions.json` — 函数名称、声明、参数、已有注释、实现体、来源
- `variables.json` — 全局/静态变量名、类型、已有注释、所在文件
- `macros.json` — 宏定义、枚举、类型别名

普通局部变量（`i`、`j`、`tmp` 等）默认跳过。  
提取不确定的内容在 `uncertain.json` 中单独列出。

## 第二步：让 AI 编写中文说明

将中间文件交给 Antigravity / Codex，按以下提示逐批处理：

> 读取 functions.json，对每个函数补充：  
> - `name_zh`：简短中文名称  
> - `description_zh`：根据实现体说明函数做什么  
> - 各参数的 `description_zh`  
> - `returns_zh`  
> 没有依据的字段留空，不确定的内容写入 `uncertainty`。  
> 完成后保存为知识包 JSON，格式见 `knowledge-packs/example/example-pack.json`。

按文件或模块分批处理，不要求一次提交整个工程。

## 第三步：校验并导出知识包

```
python validator/validate.py --pack <知识包.json>
```

校验内容：

- 必填字段（`symbol`、`kind`、`name_zh`、`source`）不为空
- `symbol` 在同一作用域内不重复
- `source.file` 路径存在（可选，传入工程目录时检查）

校验通过后，知识包即可直接使用。

## 更新知识包

1. 重新对受影响文件运行提取工具，得到新中间文件。
2. 将新中间文件与旧词条一并交给 AI，让 AI 修改对应词条。
3. 再次校验后替换旧知识包文件。

## 加载到插件

在 MTranCode 插件设置中填写知识包 JSON 路径，点击"重新加载"即生效。  
可同时加载一份工程包和一份通用包（如 HAL、FreeRTOS 常用符号）。
