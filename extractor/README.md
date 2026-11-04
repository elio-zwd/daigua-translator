# 源码事实提取器

无需第三方 Python 解析库；用途是为 AI 生成知识包提供**待复核的事实草稿**，不是 C/C++ 编译器或精确 AST。

## 使用

在仓库根目录运行（Python 3.10+）：

```powershell
python extractor/extract.py --proj "D:\\MCU\\mdk_v5\\project.uvprojx" --out extractor/out
python extractor/extract.py --src "D:\\MCU\\src" --out extractor/out
python extractor/extract.py --src "D:\\MCU\\src\\main.c" --out extractor/out
```

可选：`--include-drivers`、`--include-freertos`（仅针对预设厂商库目录过滤）。

- 支持 `.c/.h/.cpp/.hpp/.cc/.cxx/.hh/.hxx` 和单文件输入。
- Keil `.uvprojx`：读取编译文件清单、递归 IncludePath 头文件，以及源码同目录头文件。
- 识别常规文件级函数声明/定义、单行全局/静态变量、宏、简单 enum 与 typedef。
- 头文件声明与实现定义的可匹配函数按参数类型去重，优先保留实现并补入头文件的 Doxygen 说明；静态函数按相对文件作用域区分。
- 支持 `@brief`、`@param name description`、`@param name: description`、`@param[in] name description`、`@return`。
- 输出 `functions.json`、`variables.json`、`macros.json`、`uncertain.json`、`extract_summary.txt`。

## 能力边界（必须人工复核）

此工具是轻量启发式扫描器：不求解条件编译、宏展开、复杂 C++ 模板/命名空间、函数指针、重载与复杂声明。跨行全局变量及不同头文件/源文件的非一致签名可能无法完整识别。

`uncertain.json` 收录识别出的高风险情况，**并不保证包含全部漏识别项**。制作知识包时必须对照真实源码核实来源、参数、返回值和中文描述。提取草稿中 `name_zh` 为空是正常现象；需要由 AI 和人工补齐后再进入严格校验。

## 测试

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
```
