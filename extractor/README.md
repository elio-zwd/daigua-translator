# 源码事实提取器

Python 3.10+，只依赖标准库。输出供 AI 和人工复核的事实草稿。

```powershell
python extractor/extract.py --src 'D:\MCU\src' --out extractor/out
python extractor/extract.py --src 'D:\MCU\src\main.c' --out extractor/out
python extractor/extract.py --proj 'D:\MCU\05_createtask\mdk_v5\course.uvprojx' --root 'D:\MCU' --include-locals --out extractor/out
```

- `--root` 是来源相对路径基准，必须容纳工程和共享源码。不传时使用原规则：Keil 使用工程目录（`mdk_v5` 使用其父目录），目录输入用该目录，单文件输入用文件所在目录。发现根目录外文件时返回 1，提示扩大 `--root`，不覆盖已有输出。
- `--include-locals` 默认关闭。开启后收集简单单行局部声明候选，保留类型、函数、行列位置和邻近代码；`scope` 为“文件::函数:L行:C列”。过滤常见短临时名；先由 AI 筛选，再交人工筛选。
- `--include-drivers`、`--include-freertos` 放开预设厂商驱动/内核过滤；默认不批量处理。
- 支持 `.c/.h/.cpp/.hpp/.cc/.cxx/.hh/.hxx`。Keil 读取编译文件与递归 IncludePath 头文件。
- 函数去重优先保留定义并补入头文件注释；仅有唯一兼容外部定义时合并 `extern` 变量声明，跨文件静态变量分别保留。

输出：`functions.json`、`variables.json`、`macros.json`、`uncertain.json`、`extract_summary.txt`。函数体最多 50 行；附加的上下文字段不必进入正式包。

不解析条件编译、宏展开、复杂模板、命名空间或完整函数指针语法。多行变量、结构体类型等可能遗漏，须回看源码补录并在复核清单注明。`uncertain.json` 不是完整错误清单。`name_zh` 为空的草稿须补齐后才能通过正式校验。

回归：`python -m unittest discover -s tests -p "test_*.py" -v`。
