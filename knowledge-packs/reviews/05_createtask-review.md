# 05 工程知识包：中文说明与复核清单

本页直接列出已收录词条的中文名称、功能说明、参数和返回值，不需要打开 JSON 查找。
你要核对的是：**我写的中文有没有说错代码的用途、参数含义、返回结果或限制**。例如，把“就绪标志”写成“防止重复初始化”就是需要指出的错误。
先看下面 75 条已收录说明。后面的 74 条排除项没有编写正式中文，只需要检查是否遗漏了你想收录的内容。可以直接告诉我“C001 哪里不对／应改成什么”，不必自己修改 JSON。

源码版本：`2b16b3041576f4d904d7296ac00386cc289bbc53`。来源路径相对 `freertos-learning`。全部人工状态仍待复核，配置和接线说明不是实机结论。

中文原始数据：[05_createtask-pack.json](../05_createtask-pack.json)；完整候选与来源哈希：[05_createtask-review.json](05_createtask-review.json)。

## 已收录的中文说明（75 条）

### 文件：`05_createtask/src/main.c`

<a id="c001"></a>
#### C001 · `worker` — 动态工作任务

**中文说明：**读取传入的毫秒周期，申请并释放一块 64 字节堆内存用于演示，然后循环记录计数并延时。

**声明：**

```c
static void worker(void *arg)
```

**来源：**`05_createtask/src/main.c:4`；作用域：`05_createtask/src/main.c`。

**参数：**

- `arg`：指向 uint32_t 毫秒周期的指针

**返回／退出行为：**任务循环不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c002"></a>
#### C002 · `main` — 课程入口

**中文说明：**初始化板级资源，创建周期分别为 500 和 1000 毫秒的两个动态任务，启动调度器；调度器返回时进入故障处理。

**声明：**

```c
int main(void)
```

**来源：**`05_createtask/src/main.c:20`；作用域：`05_createtask/src/main.c`。

**参数：**无。

**返回／退出行为：**正常运行时不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

### 文件：`common/platform/at32f435_437_clock.c`

<a id="c003"></a>
#### C003 · `system_clock_config` — 系统时钟配置

**中文说明：**启用外部晶振和 PLL，配置 AHB/APB 分频并将系统时钟切换到 PLL；板级初始化随后更新 system_core_clock。

**声明：**

```c
void system_clock_config(void)
```

**来源：**`common/platform/at32f435_437_clock.c:57`；作用域：`common/platform/at32f435_437_clock.c`。

**参数：**无。

**返回／退出行为：**无返回值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

### 文件：`common/platform/course_board.c`

<a id="c004"></a>
#### C004 · `course_board_init` — 板级初始化

**中文说明：**配置系统时钟、优先级分组、LED、串口和 DWT 周期计数器，设置就绪标志并检查核心时钟为 288 MHz。没有防止重复调用的判断。

**声明：**

```c
void course_board_init(void)
```

**来源：**`common/platform/course_board.c:68`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c005"></a>
#### C005 · `course_led_set` — 设置 LED

**中文说明：**根据 led 选择两个 LED 引脚之一，使用低电平表示点亮。

**声明：**

```c
void course_led_set(unsigned int led, int on)
```

**来源：**`common/platform/course_board.c:26`；作用域：`common/platform/course_board.c`。

**参数：**

- `led`：0 选择 LED A，其他值选择 LED B
- `on`：非零点亮，0 熄灭

**返回／退出行为：**无返回值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c006"></a>
#### C006 · `course_led_toggle` — 翻转 LED

**中文说明：**读取所选 LED 输出位并写入相反电平。

**声明：**

```c
void course_led_toggle(unsigned int led)
```

**来源：**`common/platform/course_board.c:31`；作用域：`common/platform/course_board.c`。

**参数：**

- `led`：0 选择 LED A，其他值选择 LED B

**返回／退出行为：**无返回值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c007"></a>
#### C007 · `course_uart_write` — 串口轮询输出

**中文说明：**板级就绪后逐字节轮询 USART1 发送空闲标志并发送字符串；尚未就绪则直接返回。

**声明：**

```c
void course_uart_write(const char *text)
```

**来源：**`common/platform/course_board.c:36`；作用域：`common/platform/course_board.c`。

**参数：**

- `text`：以空字符结尾的文本指针

**返回／退出行为：**无返回值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c008"></a>
#### C008 · `course_uart_read` — 串口非阻塞读取

**中文说明：**检查 USART1 接收标志，有数据时读取一个字节；没有数据时不写入目标。

**声明：**

```c
int course_uart_read(uint8_t *byte)
```

**来源：**`common/platform/course_board.c:44`；作用域：`common/platform/course_board.c`。

**参数：**

- `byte`：接收字节的目标指针

**返回／退出行为：**有数据返回 1，否则返回 0

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c009"></a>
#### C009 · `course_log` — 格式化串口日志

**中文说明：**检查当前处于线程模式，将文本格式化到 160 字节缓冲区；调度器运行时暂停任务调度，输出文本和换行后恢复调度。中断仍可运行，不保证相对中断的原子性。

**声明：**

```c
void course_log(const char *format, ...)
```

**来源：**`common/platform/course_board.c:50`；作用域：`common/platform/course_board.c`。

**参数：**

- `format`：printf 格式字符串
- `...`：与格式字符串对应的可变参数

**返回／退出行为：**无返回值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c010"></a>
#### C010 · `course_busy_ms` — 周期计数忙等待

**中文说明：**根据核心时钟计算等待周期数，轮询 DWT 周期计数器直到达到目标；注释限定用于不超过 200 毫秒的负载演示。

**声明：**

```c
void course_busy_ms(uint32_t ms)
```

**来源：**`common/platform/course_board.c:102`；作用域：`common/platform/course_board.c`。

**参数：**

- `ms`：忙等待毫秒数

**返回／退出行为：**无返回值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c011"></a>
#### C011 · `course_keys_probe_init` — 初始化全部候选按键

**中文说明：**遍历八项候选引脚表，逐项配置输入模式，用于识别实际板载按键。

**声明：**

```c
void course_keys_probe_init(void)
```

**来源：**`common/platform/course_board.c:121`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c012"></a>
#### C012 · `course_keys_raw` — 读取候选按键电平

**中文说明：**遍历八项候选输入，将高电平输入映射到返回值的对应位；此值不等于经过消抖的按下状态。

**声明：**

```c
uint32_t course_keys_raw(void)
```

**来源：**`common/platform/course_board.c:126`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**八个候选输入的电平位图

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c013"></a>
#### C013 · `course_key_ready` — 检查按键配置

**中文说明：**检查 COURSE_KEY_INDEX 是否非零；默认值 0 表示尚未确认按键。

**声明：**

```c
int course_key_ready(void)
```

**来源：**`common/platform/course_board.c:135`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**已配置返回非零，否则返回 0

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c014"></a>
#### C014 · `course_key_pressed` — 读取按键按下状态

**中文说明：**未配置按键时返回 0；否则比较所选引脚电平与 COURSE_KEY_ACTIVE_LEVEL，不进行消抖。

**声明：**

```c
int course_key_pressed(void)
```

**来源：**`common/platform/course_board.c:140`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**按下返回 1，否则返回 0

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c015"></a>
#### C015 · `course_key_input_init` — 初始化选定按键

**中文说明：**仅在按键索引非零时，按候选表配置选定输入。

**声明：**

```c
void course_key_input_init(void)
```

**来源：**`common/platform/course_board.c:136`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c016"></a>
#### C016 · `course_key_irq_init` — 初始化按键外部中断

**中文说明：**未配置按键时直接返回 0；否则配置输入、外部中断映射、双边沿触发和 NVIC 优先级。

**声明：**

```c
int course_key_irq_init(void)
```

**来源：**`common/platform/course_board.c:149`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**配置成功返回 1，按键未配置返回 0

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c017"></a>
#### C017 · `course_key_isr` — 按键中断弱回调

**中文说明：**提供默认空实现，供课程应用覆盖。

**声明：**

```c
__weak void course_key_isr(void)
```

**来源：**`common/platform/course_board.c:168`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c018"></a>
#### C018 · `course_stats_init` — 运行时间计数器初始化

**中文说明：**根据 APB1 分频计算定时器时钟，将 TMR2 配置为 32 位向上计数，目标计数频率为 10 kHz。

**声明：**

```c
void course_stats_init(void)
```

**来源：**`common/platform/course_board.c:184`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c019"></a>
#### C019 · `course_stats_counter` — 读取运行时间计数

**中文说明：**读取 TMR2 当前计数值；运行时间统计默认未启用。

**声明：**

```c
uint32_t course_stats_counter(void)
```

**来源：**`common/platform/course_board.c:198`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**TMR2 计数值

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

### 文件：`common/platform/course_hooks.c`

<a id="c020"></a>
#### C020 · `course_fail` — 报告课程运行失败

**中文说明：**将给定原因传给 stop，关闭中断、记录故障并停止运行。

**声明：**

```c
void course_fail(const char *reason)
```

**来源：**`common/platform/course_hooks.c:17`；作用域：`common/platform/course_hooks.c`。

**参数：**

- `reason`：故障原因字符串

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c021"></a>
#### C021 · `course_assert_fail` — 报告断言失败

**中文说明：**将 assert 原因及源文件行号传给 stop。

**声明：**

```c
void course_assert_fail(const char *file, unsigned int line)
```

**来源：**`common/platform/course_hooks.c:18`；作用域：`common/platform/course_hooks.c`。

**参数：**

- `file`：断言发生的文件名
- `line`：断言行号

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

### 文件：`common/platform/course_board.c`

<a id="c022"></a>
#### C022 · `key_input` — 配置候选按键输入

**中文说明：**打开候选按键所在端口时钟，将对应引脚配置为采用 COURSE_KEY_PULL 的输入模式。

**声明：**

```c
static void key_input(const key_pin_type *key)
```

**来源：**`common/platform/course_board.c:109`；作用域：`common/platform/course_board.c`。

**参数：**

- `key`：候选引脚表项指针

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c023"></a>
#### C023 · `key_irq_dispatch` — 分发按键中断

**中文说明：**检查选定按键的外部中断标志，清除标志后调用 course_key_isr。

**声明：**

```c
static void key_irq_dispatch(void)
```

**来源：**`common/platform/course_board.c:169`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c024"></a>
#### C024 · `EXINT1_IRQHandler` — 外部中断处理入口

**中文说明：**将该组外部中断交给 key_irq_dispatch 检查并分发；默认按键索引为 0 时不调用按键回调。

**声明：**

```c
void EXINT1_IRQHandler(void)
```

**来源：**`common/platform/course_board.c:179`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c025"></a>
#### C025 · `EXINT2_IRQHandler` — 外部中断处理入口

**中文说明：**将该组外部中断交给 key_irq_dispatch 检查并分发；默认按键索引为 0 时不调用按键回调。

**声明：**

```c
void EXINT2_IRQHandler(void)
```

**来源：**`common/platform/course_board.c:180`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c026"></a>
#### C026 · `EXINT4_IRQHandler` — 外部中断处理入口

**中文说明：**将该组外部中断交给 key_irq_dispatch 检查并分发；默认按键索引为 0 时不调用按键回调。

**声明：**

```c
void EXINT4_IRQHandler(void)
```

**来源：**`common/platform/course_board.c:181`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c027"></a>
#### C027 · `EXINT15_10_IRQHandler` — 外部中断处理入口

**中文说明：**将该组外部中断交给 key_irq_dispatch 检查并分发；默认按键索引为 0 时不调用按键回调。

**声明：**

```c
void EXINT15_10_IRQHandler(void)
```

**来源：**`common/platform/course_board.c:182`；作用域：`common/platform/course_board.c`。

**参数：**无。

**返回／退出行为：**无返回值

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

### 文件：`common/platform/course_hooks.c`

<a id="c028"></a>
#### C028 · `stop` — 故障停机

**中文说明：**关闭中断，记录原因、文件和行号，点亮两个 LED 并尝试输出简短故障文本，随后永久循环。不会保存寄存器现场。

**声明：**

```c
static void stop(const char *reason, const char *file, unsigned int line)
```

**来源：**`common/platform/course_hooks.c:3`；作用域：`common/platform/course_hooks.c`。

**参数：**

- `reason`：故障原因
- `file`：来源文件，可为空指针
- `line`：来源行号，可为 0

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c029"></a>
#### C029 · `vApplicationMallocFailedHook` — 堆分配失败钩子

**中文说明：**进入 stop，记录 allocation failed 原因；配置已启用此钩子。

**声明：**

```c
void vApplicationMallocFailedHook(void)
```

**来源：**`common/platform/course_hooks.c:19`；作用域：`common/platform/course_hooks.c`。

**参数：**无。

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c030"></a>
#### C030 · `vApplicationStackOverflowHook` — 任务栈溢出钩子

**中文说明：**忽略任务句柄和名称，进入 stop 记录 stack overflow。

**声明：**

```c
void vApplicationStackOverflowHook(TaskHandle_t task, char *name)
```

**来源：**`common/platform/course_hooks.c:20`；作用域：`common/platform/course_hooks.c`。

**参数：**

- `task`：发生溢出的任务句柄，本实现未使用
- `name`：任务名，本实现未使用

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c031"></a>
#### C031 · `HardFault_Handler` — 硬故障处理

**中文说明：**进入 stop，记录 HardFault 原因并停机。

**声明：**

```c
void HardFault_Handler(void)
```

**来源：**`common/platform/course_hooks.c:26`；作用域：`common/platform/course_hooks.c`。

**参数：**无。

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c032"></a>
#### C032 · `MemManage_Handler` — 内存管理故障处理

**中文说明：**进入 stop，记录 MemManage 原因并停机。

**声明：**

```c
void MemManage_Handler(void)
```

**来源：**`common/platform/course_hooks.c:27`；作用域：`common/platform/course_hooks.c`。

**参数：**无。

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c033"></a>
#### C033 · `BusFault_Handler` — 总线故障处理

**中文说明：**进入 stop，记录 BusFault 原因并停机。

**声明：**

```c
void BusFault_Handler(void)
```

**来源：**`common/platform/course_hooks.c:28`；作用域：`common/platform/course_hooks.c`。

**参数：**无。

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

<a id="c034"></a>
#### C034 · `UsageFault_Handler` — 用法故障处理

**中文说明：**进入 stop，记录 UsageFault 原因并停机。

**声明：**

```c
void UsageFault_Handler(void)
```

**来源：**`common/platform/course_hooks.c:29`；作用域：`common/platform/course_hooks.c`。

**参数：**无。

**返回／退出行为：**不返回

**收录原因：**应用或共享板级模块的功能入口。**人工状态：**待复核。

---

### 文件：`05_createtask/src/main.c`

<a id="c039"></a>
#### C039 · `intervals` — 任务周期数组

**中文说明：**保存两个任务的毫秒周期 500 和 1000，地址作为 worker 的参数传入。

**声明：**

```c
static const uint32_t intervals[2] = {500,1000}
```

**来源：**`05_createtask/src/main.c:3`；作用域：`05_createtask/src/main.c`。

**收录原因：**跨调用保存的重要状态或任务参数。**人工状态：**待复核。

---

<a id="c040"></a>
#### C040 · `local_count` — 任务局部计数

**中文说明：**每个任务各自保存的循环计数，每次输出前递增。

**声明：**

```c
uint32_t local_count = 0
```

**来源：**`05_createtask/src/main.c:6`；作用域：`05_createtask/src/main.c::worker:L6:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

<a id="c041"></a>
#### C041 · `interval` — 任务延时周期

**中文说明：**从 arg 指向的 uint32_t 读取的毫秒数，循环中转换为 tick 后延时。

**声明：**

```c
uint32_t interval = *(const uint32_t *)arg
```

**来源：**`05_createtask/src/main.c:7`；作用域：`05_createtask/src/main.c::worker:L7:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

<a id="c042"></a>
#### C042 · `block` — 演示堆块指针

**中文说明：**申请 64 字节后检查非空、输出地址并释放，只在进入循环前使用。

**声明：**

```c
void *block = pvPortMalloc(64)
```

**来源：**`05_createtask/src/main.c:8`；作用域：`05_createtask/src/main.c::worker:L8:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

### 文件：`common/platform/course_board.c`

<a id="c043"></a>
#### C043 · `board_ready` — 串口输出就绪标志

**中文说明：**初始为 0，板级初始化后设为 1；course_uart_write 据此决定是否输出，不用于防止重复初始化。

**声明：**

```c
static int board_ready
```

**来源：**`common/platform/course_board.c:24`；作用域：`common/platform/course_board.c`。

**收录原因：**跨调用保存的重要状态或任务参数。**人工状态：**待复核。

---

<a id="c045"></a>
#### C045 · `buffer` — 日志格式化缓冲区

**中文说明：**160 字节的局部字符数组，格式化结果可能被截断，并显式保证末尾为空字符。

**声明：**

```c
char buffer[160]
```

**来源：**`common/platform/course_board.c:52`；作用域：`common/platform/course_board.c::course_log:L52:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

<a id="c047"></a>
#### C047 · `running` — 调度器运行标志

**中文说明：**标记调度器是否处于运行状态，用于成对暂停和恢复任务调度。

**声明：**

```c
BaseType_t running
```

**来源：**`common/platform/course_board.c:54`；作用域：`common/platform/course_board.c::course_log:L54:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

<a id="c049"></a>
#### C049 · `start` — 忙等待起始周期

**中文说明：**保存 DWT 周期计数器初值，用无符号差值判断经过的周期。

**声明：**

```c
uint32_t start = DWT->CYCCNT
```

**来源：**`common/platform/course_board.c:104`；作用域：`common/platform/course_board.c::course_busy_ms:L104:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

<a id="c050"></a>
#### C050 · `cycles` — 目标等待周期数

**中文说明：**将毫秒换算为核心时钟周期数，供短时忙等待判断。

**声明：**

```c
uint32_t cycles = (system_core_clock / 1000U) * ms
```

**来源：**`common/platform/course_board.c:105`；作用域：`common/platform/course_board.c::course_busy_ms:L105:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

<a id="c052"></a>
#### C052 · `mask` — 候选按键电平位图

**中文说明：**逐位记录八个候选输入当前是否为高电平，不进行消抖。

**声明：**

```c
uint32_t mask = 0
```

**来源：**`common/platform/course_board.c:129`；作用域：`common/platform/course_board.c::course_keys_raw:L129:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

<a id="c059"></a>
#### C059 · `timer_clock` — 统计定时器输入频率

**中文说明：**从 APB1 频率推导定时器频率，用于设置 10 kHz 计数分频。

**声明：**

```c
uint32_t timer_clock
```

**来源：**`common/platform/course_board.c:187`；作用域：`common/platform/course_board.c::course_stats_init:L187:C5`。

**收录原因：**AI 初筛：对理解课程行为有帮助的局部状态。**人工状态：**待复核。

---

### 文件：`common/platform/course_hooks.c`

<a id="c060"></a>
#### C060 · `course_last_fault` — 最近故障记录

**中文说明：**保存 stop 写入的原因字符串、来源文件和行号，不包含 CPU 寄存器快照。

**声明：**

```c
volatile course_fault_type course_last_fault
```

**来源：**`common/platform/course_hooks.c:2`；作用域：`common/platform/course_hooks.c`。

**收录原因：**跨调用保存的重要状态或任务参数。**人工状态：**待复核。

---

### 文件：`common/include/course.h`

<a id="c082"></a>
#### C082 · `COURSE_STACK` — 课程默认栈深度

**中文说明：**值为 256，作为课程任务栈深度常量；实际使用位置决定计量单位。

**声明：**

```c
#define COURSE_STACK 256U
```

**来源：**`common/include/course.h:13`；作用域：`common/include/course.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c083"></a>
#### C083 · `COURSE_LOG_STACK` — 日志任务栈深度

**中文说明：**值为 512，05 工程将其作为 xTaskCreate 的栈深度，单位为 StackType_t 元素数。

**声明：**

```c
#define COURSE_LOG_STACK 512U
```

**来源：**`common/include/course.h:14`；作用域：`common/include/course.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c084"></a>
#### C084 · `COURSE_CHECK` — 课程断言入口

**中文说明：**将条件交给 configASSERT，失败时调用课程断言处理。

**声明：**

```c
#define COURSE_CHECK(x) configASSERT(x)
```

**来源：**`common/include/course.h:15`；作用域：`common/include/course.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

### 文件：`common/include/course_board_config.h`

<a id="c087"></a>
#### C087 · `COURSE_KEY_INDEX` — 候选按键索引

**中文说明：**值为 0 表示尚未确认；1 到 8 对应候选表，不表示板上接线已经核实。

**声明：**

```c
#define COURSE_KEY_INDEX 0
```

**来源：**`common/include/course_board_config.h:5`；作用域：`common/include/course_board_config.h`。

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c088"></a>
#### C088 · `COURSE_KEY_ACTIVE_LEVEL` — 按键有效电平

**中文说明：**当前为 0，用于按下状态比较；须实际确认引脚和极性后使用。

**声明：**

```c
#define COURSE_KEY_ACTIVE_LEVEL 0
```

**来源：**`common/include/course_board_config.h:6`；作用域：`common/include/course_board_config.h`。

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c089"></a>
#### C089 · `COURSE_KEY_PULL` — 按键输入上下拉配置

**中文说明：**当前为 GPIO_PULL_NONE，配置候选按键输入时使用。

**声明：**

```c
#define COURSE_KEY_PULL GPIO_PULL_NONE
```

**来源：**`common/include/course_board_config.h:7`；作用域：`common/include/course_board_config.h`。

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c090"></a>
#### C090 · `COURSE_IRQ_PRIORITY` — 按键中断优先级

**中文说明：**值为 6，传给按键外部中断的 NVIC 配置。

**声明：**

```c
#define COURSE_IRQ_PRIORITY 6
```

**来源：**`common/include/course_board_config.h:8`；作用域：`common/include/course_board_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c091"></a>
#### C091 · `COURSE_LED_A_PIN` — LED A 引脚掩码

**中文说明：**配置为 GPIO_PINS_12，板级代码在 GPIOC 上使用。

**声明：**

```c
#define COURSE_LED_A_PIN GPIO_PINS_12
```

**来源：**`common/include/course_board_config.h:9`；作用域：`common/include/course_board_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c092"></a>
#### C092 · `COURSE_LED_B_PIN` — LED B 引脚掩码

**中文说明：**配置为 GPIO_PINS_9，板级代码在 GPIOC 上使用。

**声明：**

```c
#define COURSE_LED_B_PIN GPIO_PINS_9
```

**来源：**`common/include/course_board_config.h:10`；作用域：`common/include/course_board_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c093"></a>
#### C093 · `COURSE_UART_BAUD` — 调试串口波特率

**中文说明：**USART1 初始化使用的波特率，值为 115200。

**声明：**

```c
#define COURSE_UART_BAUD 115200U
```

**来源：**`common/include/course_board_config.h:11`；作用域：`common/include/course_board_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

### 文件：`common/include/course_rtos_config.h`

<a id="c096"></a>
#### C096 · `configCPU_CLOCK_HZ` — RTOS 核心时钟频率

**中文说明：**引用 system_core_clock，由板级初始化更新后用于 RTOS 配置。

**声明：**

```c
#define configCPU_CLOCK_HZ system_core_clock
```

**来源：**`common/include/course_rtos_config.h:8`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c097"></a>
#### C097 · `configTICK_RATE_HZ` — RTOS 节拍频率

**中文说明：**值为 1000 Hz，供延时与节拍换算。

**声明：**

```c
#define configTICK_RATE_HZ 1000U
```

**来源：**`common/include/course_rtos_config.h:9`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c098"></a>
#### C098 · `configMAX_PRIORITIES` — 任务优先级数量

**中文说明：**配置为 8，任务优先级有效范围为 0 到 7。

**声明：**

```c
#define configMAX_PRIORITIES 8
```

**来源：**`common/include/course_rtos_config.h:10`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c099"></a>
#### C099 · `configMINIMAL_STACK_SIZE` — 最小任务栈深度

**中文说明：**配置为 256 个 StackType_t 元素，供空闲任务等使用。

**声明：**

```c
#define configMINIMAL_STACK_SIZE 256U
```

**来源：**`common/include/course_rtos_config.h:11`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c100"></a>
#### C100 · `configTOTAL_HEAP_SIZE` — RTOS 堆容量

**中文说明：**配置为 60×1024 字节，最终行为还取决于工程所链接的堆实现。

**声明：**

```c
#define configTOTAL_HEAP_SIZE (60U * 1024U)
```

**来源：**`common/include/course_rtos_config.h:12`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c101"></a>
#### C101 · `configMAX_TASK_NAME_LEN` — 任务名存储长度

**中文说明：**配置为 16，包含字符串结尾所需空间。

**声明：**

```c
#define configMAX_TASK_NAME_LEN 16
```

**来源：**`common/include/course_rtos_config.h:13`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c103"></a>
#### C103 · `configUSE_PREEMPTION` — 抢占调度开关

**中文说明：**配置为 1，启用抢占式任务调度。

**声明：**

```c
#define configUSE_PREEMPTION 1
```

**来源：**`common/include/course_rtos_config.h:15`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c104"></a>
#### C104 · `configUSE_TIME_SLICING` — 同优先级时间片开关

**中文说明：**未由外部预定义时默认为 1；05 工程配置中未覆盖此默认值。

**声明：**

```c
#define configUSE_TIME_SLICING 1
```

**来源：**`common/include/course_rtos_config.h:17`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c106"></a>
#### C106 · `configSUPPORT_DYNAMIC_ALLOCATION` — 动态分配开关

**中文说明：**配置为 1，允许使用动态分配 API 创建任务等对象。

**声明：**

```c
#define configSUPPORT_DYNAMIC_ALLOCATION 1
```

**来源：**`common/include/course_rtos_config.h:20`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c107"></a>
#### C107 · `configSUPPORT_STATIC_ALLOCATION` — 静态分配开关

**中文说明：**未由外部预定义时默认为 0；05 工程未覆盖，因此静态任务内存钩子分支不启用。

**声明：**

```c
#define configSUPPORT_STATIC_ALLOCATION 0
```

**来源：**`common/include/course_rtos_config.h:22`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c110"></a>
#### C110 · `configCHECK_FOR_STACK_OVERFLOW` — 栈溢出检查模式

**中文说明：**配置为 2，启用对应的 RTOS 栈溢出检查方式。

**声明：**

```c
#define configCHECK_FOR_STACK_OVERFLOW 2
```

**来源：**`common/include/course_rtos_config.h:28`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c111"></a>
#### C111 · `configUSE_MALLOC_FAILED_HOOK` — 堆分配失败钩子开关

**中文说明：**配置为 1，使用 vApplicationMallocFailedHook 处理 RTOS 堆分配失败。

**声明：**

```c
#define configUSE_MALLOC_FAILED_HOOK 1
```

**来源：**`common/include/course_rtos_config.h:29`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c118"></a>
#### C118 · `configUSE_TIMERS` — 软件定时器开关

**中文说明：**未由外部预定义时默认为 0；05 工程未覆盖，定时器任务内存钩子分支不启用。

**声明：**

```c
#define configUSE_TIMERS 0
```

**来源：**`common/include/course_rtos_config.h:43`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c123"></a>
#### C123 · `configGENERATE_RUN_TIME_STATS` — 运行时间统计开关

**中文说明：**未由外部预定义时默认为 0，05 工程未启用运行时间统计。

**声明：**

```c
#define configGENERATE_RUN_TIME_STATS 0
```

**来源：**`common/include/course_rtos_config.h:52`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c139"></a>
#### C139 · `configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY` — 可调用 RTOS API 的中断优先级边界

**中文说明：**配置库级优先级数值为 5；使用允许在中断中调用的 API 时还须遵循对应 FreeRTOS 端口规则。

**声明：**

```c
#define configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY 5
```

**来源：**`common/include/course_rtos_config.h:69`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

<a id="c142"></a>
#### C142 · `configASSERT` — RTOS 断言宏

**中文说明：**条件为假时将 __FILE__ 和 __LINE__ 交给 course_assert_fail。

**声明：**

```c
#define configASSERT(x) do { if (!(x)) course_assert_fail(__FILE__, __LINE__); } while (0)
```

**来源：**`common/include/course_rtos_config.h:72`；作用域：`common/include/course_rtos_config.h`。

**收录原因：**直接影响 05 任务或共享模块行为的配置。**人工状态：**待复核。

---

### 文件：`common/platform/course_board.c`

<a id="c147"></a>
#### C147 · `keys` — 候选按键引脚表

**中文说明：**保存八组候选 GPIO、引脚与外部中断映射；源码明确声明这不是已核实的板级原理图。

**声明：**

```c
static const key_pin_type keys[8] = {
    {GPIOB, GPIO_PINS_13, SCFG_PORT_SOURCE_GPIOB, SCFG_PINS_SOURCE13, EXINT15_10_IRQn},
    {GPIOB, GPIO_PINS_14, SCFG_PORT_SOURCE_GPIOB, SCFG_PINS_SOURCE14, EXINT15_10_IRQn},
    {GPIOB, GPIO_PINS_15, SCFG_PORT_SOURCE_GPIOB, SCFG_PINS_SOURCE15, EXINT15_10_IRQn},
    {GPIOE, GPIO_PINS_1, SCFG_PORT_SOURCE_GPIOE, SCFG_PINS_SOURCE1, EXINT1_IRQn},
    {GPIOD, GPIO_PINS_2, SCFG_PORT_SOURCE_GPIOD, SCFG_PINS_SOURCE2, EXINT2_IRQn},
    {GPIOD, GPIO_PINS_12, SCFG_PORT_SOURCE_GPIOD, SCFG_PINS_SOURCE12, EXINT15_10_IRQn},
    {GPIOB, GPIO_PINS_2, SCFG_PORT_SOURCE_GPIOB, SCFG_PINS_SOURCE2, EXINT2_IRQn},
    {GPIOE, GPIO_PINS_4, SCFG_PORT_SOURCE_GPIOE, SCFG_PINS_SOURCE4, EXINT4_IRQn}
};
```

**来源：**`common/platform/course_board.c:14`；作用域：`common/platform/course_board.c`。

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**AI 回看源码补录提取器未覆盖的结构。**人工状态：**待复核。

---

<a id="c148"></a>
#### C148 · `key_pin_type` — 候选按键引脚类型

**中文说明：**保存端口、引脚、外部中断映射和中断号。

**声明：**

```c
typedef struct {
    gpio_type *port;
    uint16_t pin;
    scfg_port_source_type source;
    scfg_pins_source_type line;
    IRQn_Type irq;
} key_pin_type;
```

**来源：**`common/platform/course_board.c:6`；作用域：`common/platform/course_board.c`。

**待确认：**仅核对代码行为；候选按键接线及极性尚未通过物理板卡确认，COURSE_KEY_INDEX 当前为 0。

**收录原因：**AI 回看源码补录提取器未覆盖的结构。**人工状态：**待复核。

---

### 文件：`common/include/course_hooks.h`

<a id="c149"></a>
#### C149 · `course_fault_type` — 课程故障记录类型

**中文说明：**包含故障原因、文件名和行号，不包含寄存器现场。

**声明：**

```c
typedef struct {
    const char *reason;
    const char *file;
    unsigned int line;
} course_fault_type;
```

**来源：**`common/include/course_hooks.h:3`；作用域：`common/include/course_hooks.h`。

**收录原因：**AI 回看源码补录提取器未覆盖的结构。**人工状态：**待复核。

---

## 未收录的候选（74 条）

这些项目没有待采用的中文译文。这里只核对排除理由：如果你希望解释其中某项，告诉我编号即可。

| 编号 | 符号 | 来源 | 排除原因 | 人工状态 |
|---|---|---|---|---|
| C035 | `vApplicationGetIdleTaskMemory` | `common/platform/course_hooks.c:31` | 05 配置未启用静态分配或软件定时器，该条件分支不收录 | 待复核 |
| C036 | `vApplicationGetTimerTaskMemory` | `common/platform/course_hooks.c:38` | 05 配置未启用静态分配或软件定时器，该条件分支不收录 | 待复核 |
| C037 | `SystemInit` | `common/vendor/cmsis/device/system_at32f435_437.c:62` | 厂商实现，本轮范围排除；调用方解释保留依赖关系 | 待复核 |
| C038 | `system_core_clock_update` | `common/vendor/cmsis/device/system_at32f435_437.c:112` | 厂商实现，本轮范围排除；调用方解释保留依赖关系 | 待复核 |
| C044 | `pin` | `common/platform/course_board.c:33` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C046 | `args` | `common/platform/course_board.c:53` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C048 | `gpio` | `common/platform/course_board.c:70` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C051 | `gpio` | `common/platform/course_board.c:111` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C053 | `key` | `common/platform/course_board.c:142` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C054 | `level` | `common/platform/course_board.c:143` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C055 | `key` | `common/platform/course_board.c:151` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C056 | `ext` | `common/platform/course_board.c:152` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C057 | `line` | `common/platform/course_board.c:172` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C058 | `clocks` | `common/platform/course_board.c:186` | 通用临时配置或实现中间量，可在所属函数中理解 | 待复核 |
| C061 | `idle_tcb` | `common/platform/course_hooks.c:33` | 05 配置未启用静态分配或软件定时器，该条件分支不收录 | 待复核 |
| C062 | `idle_stack` | `common/platform/course_hooks.c:34` | 05 配置未启用静态分配或软件定时器，该条件分支不收录 | 待复核 |
| C063 | `timer_tcb` | `common/platform/course_hooks.c:40` | 05 配置未启用静态分配或软件定时器，该条件分支不收录 | 待复核 |
| C064 | `timer_stack` | `common/platform/course_hooks.c:41` | 05 配置未启用静态分配或软件定时器，该条件分支不收录 | 待复核 |
| C065 | `system_core_clock` | `common/vendor/cmsis/device/system_at32f435_437.c:46` | 厂商实现，本轮范围排除；调用方解释保留依赖关系 | 待复核 |
| C066 | `sclk_source` | `common/vendor/cmsis/device/system_at32f435_437.c:116` | 厂商实现细节，本轮不批量解释 SDK | 待复核 |
| C067 | `FREERTOS_CONFIG_H` | `05_createtask/inc/FreeRTOSConfig.h:2` | 头文件包含保护，不作为业务词条 | 待复核 |
| C068 | `COURSE_AT32_CONF_H` | `common/include/at32f435_437_conf.h:2` | 头文件包含保护，不作为业务词条 | 待复核 |
| C069 | `HEXT_VALUE` | `common/include/at32f435_437_conf.h:3` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C070 | `HEXT_STARTUP_TIMEOUT` | `common/include/at32f435_437_conf.h:4` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C071 | `HICK_VALUE` | `common/include/at32f435_437_conf.h:5` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C072 | `CRM_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:6` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C073 | `GPIO_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:8` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C074 | `USART_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:10` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C075 | `PWC_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:12` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C076 | `FLASH_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:14` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C077 | `TMR_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:16` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C078 | `MISC_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:18` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C079 | `SCFG_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:20` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C080 | `EXINT_MODULE_ENABLED` | `common/include/at32f435_437_conf.h:22` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C081 | `COURSE_H` | `common/include/course.h:2` | 头文件包含保护，不作为业务词条 | 待复核 |
| C085 | `COURSE_BOARD_H` | `common/include/course_board.h:2` | 头文件包含保护，不作为业务词条 | 待复核 |
| C086 | `COURSE_BOARD_CONFIG_H` | `common/include/course_board_config.h:2` | 头文件包含保护，不作为业务词条 | 待复核 |
| C094 | `COURSE_HOOKS_H` | `common/include/course_hooks.h:2` | 头文件包含保护，不作为业务词条 | 待复核 |
| C095 | `COURSE_RTOS_CONFIG_H` | `common/include/course_rtos_config.h:2` | 头文件包含保护，不作为业务词条 | 待复核 |
| C102 | `configUSE_16_BIT_TICKS` | `common/include/course_rtos_config.h:14` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C105 | `configIDLE_SHOULD_YIELD` | `common/include/course_rtos_config.h:19` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C108 | `configUSE_IDLE_HOOK` | `common/include/course_rtos_config.h:25` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C109 | `configUSE_TICK_HOOK` | `common/include/course_rtos_config.h:27` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C112 | `configUSE_CO_ROUTINES` | `common/include/course_rtos_config.h:30` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C113 | `configUSE_MUTEXES` | `common/include/course_rtos_config.h:31` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C114 | `configUSE_RECURSIVE_MUTEXES` | `common/include/course_rtos_config.h:33` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C115 | `configUSE_COUNTING_SEMAPHORES` | `common/include/course_rtos_config.h:36` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C116 | `configUSE_QUEUE_SETS` | `common/include/course_rtos_config.h:39` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C117 | `configUSE_TASK_NOTIFICATIONS` | `common/include/course_rtos_config.h:41` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C119 | `configTIMER_TASK_PRIORITY` | `common/include/course_rtos_config.h:45` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C120 | `configTIMER_QUEUE_LENGTH` | `common/include/course_rtos_config.h:46` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C121 | `configTIMER_TASK_STACK_DEPTH` | `common/include/course_rtos_config.h:47` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C122 | `configUSE_TRACE_FACILITY` | `common/include/course_rtos_config.h:49` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C124 | `configUSE_STATS_FORMATTING_FUNCTIONS` | `common/include/course_rtos_config.h:54` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C125 | `portCONFIGURE_TIMER_FOR_RUN_TIME_STATS` | `common/include/course_rtos_config.h:55` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C126 | `portGET_RUN_TIME_COUNTER_VALUE` | `common/include/course_rtos_config.h:56` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C127 | `INCLUDE_vTaskPrioritySet` | `common/include/course_rtos_config.h:57` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C128 | `INCLUDE_uxTaskPriorityGet` | `common/include/course_rtos_config.h:58` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C129 | `INCLUDE_vTaskDelete` | `common/include/course_rtos_config.h:59` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C130 | `INCLUDE_vTaskSuspend` | `common/include/course_rtos_config.h:60` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C131 | `INCLUDE_vTaskDelay` | `common/include/course_rtos_config.h:61` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C132 | `INCLUDE_vTaskDelayUntil` | `common/include/course_rtos_config.h:62` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C133 | `INCLUDE_xTaskGetSchedulerState` | `common/include/course_rtos_config.h:63` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C134 | `INCLUDE_xTaskGetCurrentTaskHandle` | `common/include/course_rtos_config.h:64` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C135 | `INCLUDE_eTaskGetState` | `common/include/course_rtos_config.h:65` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C136 | `INCLUDE_uxTaskGetStackHighWaterMark` | `common/include/course_rtos_config.h:66` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C137 | `configPRIO_BITS` | `common/include/course_rtos_config.h:67` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C138 | `configLIBRARY_LOWEST_INTERRUPT_PRIORITY` | `common/include/course_rtos_config.h:68` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C140 | `configKERNEL_INTERRUPT_PRIORITY` | `common/include/course_rtos_config.h:70` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C141 | `configMAX_SYSCALL_INTERRUPT_PRIORITY` | `common/include/course_rtos_config.h:71` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C143 | `vPortSVCHandler` | `common/include/course_rtos_config.h:73` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C144 | `xPortPendSVHandler` | `common/include/course_rtos_config.h:74` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C145 | `xPortSysTickHandler` | `common/include/course_rtos_config.h:75` | 库开关、接口别名或本课不直接使用的配置，本轮不逐项解释 | 待复核 |
| C146 | `VECT_TAB_OFFSET` | `common/vendor/cmsis/device/system_at32f435_437.c:38` | 厂商实现，本轮范围排除；调用方解释保留依赖关系 | 待复核 |

## 范围与后续更新

启发式扫描覆盖 13 个文件；复杂声明和条件编译仍需回看源码。`keys`、`key_pin_type`、`course_fault_type` 由 AI 对照源码补录，未冒充人类已审阅。
当前静态分配和软件定时器配置未启用，相应内存钩子及局部缓冲候选排除。SDK 内部实现不批量收录；课程共享平台的 `system_clock_config` 已收录。
本页的中文来自正式知识包。后续修改知识包中文时，应同步更新本页；人工确认后再更新候选 JSON 中对应的人工状态。
