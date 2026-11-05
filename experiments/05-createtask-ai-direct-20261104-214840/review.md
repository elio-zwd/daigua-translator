# 05_createtask AI 直接阅读源码制作知识包：试验复核报告

> **试验说明**：本报告记录完全取消符号提取脚本前置环节，由 AI 直接阅读 C/H 源码生成中文知识包的试验过程、词条清单、结构校验、与旧结果的逐项比对及复查结论。

---

## 1. 范围与阅读完成情况

- **实验工程**：`05_createtask`
- **Keil 工程**：`05_createtask/mdk_v5/course.uvprojx`
- **构建 Target**：`course_05`（目标设备：AT32F435VGT7）
- **源码根目录**：`M:\005869\FreeRtos\projects\freertos-learning`
- **AI 模型**：`Gemini 3.8 Flash (High)`
- **执行环境**：Windows 10 x64，`pwsh.exe`（PowerShell 7.5.x），Python 3.14.3
- **词条统计**：
  - 初稿知识包 (`pack-initial.json`)：**120** 条
  - 修订知识包 (`pack-revised.json`)：**122** 条（补充了旧包比对中确认有价值的 2 个局部变量 `mask` 与 `timer_clock`）
- **尚未完成事项**：
  - 硬件实机按键接线确认：`COURSE_KEY_INDEX` 仍保持默认未配置值 `0`，待硬件环境连板实测识别。
  - 全部词条的人工语义复核状态当前初始置为 `pending`（待复核）。

### 实际读取文件列表及 SHA-256

| 相对路径 | 角色 | 行范围 | SHA-256 | 阅读状态 | 纳入理由 |
| --- | --- | --- | --- | --- | --- |
| `05_createtask/mdk_v5/course.uvprojx` | 工程配置 | 1-538 | `a5c9bfd739b0401d...` | complete | 确定 Target 名称 (course_05)、预处理器宏、包含路径及工程源码组构成 |
| `05_createtask/src/main.c` | 制作词条 | 1-29 | `46e923fac4bb06c6...` | complete | 05 实验核心业务源码，定义任务周期配置、worker 任务函数及 main 入口 |
| `05_createtask/inc/FreeRTOSConfig.h` | 制作词条 | 1-5 | `4fb81f2069993580...` | complete | 实验自有 FreeRTOS 配置头文件，引入公共 RTOS 配置 |
| `common/platform/course_board.c` | 制作词条 | 1-198 | `99f81be446d81b4e...` | complete | 共享板级支持模块实现，包含 LED、串口、日志、忙等待、按键探测及统计定时器 |
| `common/platform/course_hooks.c` | 制作词条 | 1-45 | `b374e771bb627a3c...` | complete | 共享故障与钩子处理模块，定义 fault 记录变量、停机处理、断言、内存失败及异常向量 |
| `common/platform/at32f435_437_clock.c` | 制作词条 | 1-123 | `789a93fd49156c34...` | complete | 芯片系统时钟初始化实现，配置 PLL 288MHz、LDO 电压及总线分频 |
| `common/include/course.h` | 制作词条 | 1-18 | `c4d41fb186c95402...` | complete | 课程全局公共头文件，定义栈常量 COURSE_STACK、COURSE_LOG_STACK 及断言宏 COURSE_CHECK |
| `common/include/course_board.h` | 制作词条 | 1-20 | `4f21b6523609e56d...` | complete | 板级支持接口声明头文件，函数声明与 course_board.c 定义合并后优先引用实现位置 |
| `common/include/course_board_config.h` | 制作词条 | 1-18 | `e5821a8487f4175f...` | complete | 硬件接线与配置参数宏定义，包含 LED、串口、中断优先级及按键候选配置 |
| `common/include/course_hooks.h` | 制作词条 | 1-11 | `63e600e400c4755d...` | complete | 故障钩子接口与结构体类型声明，定义 course_fault_type 及停机接口声明 |
| `common/include/course_rtos_config.h` | 制作词条 | 1-76 | `a6d980f80b038c21...` | complete | 课程通用 FreeRTOS 内核配置头文件，定义调度、堆栈、优先级、裁剪宏及中断映射 |
| `common/include/at32f435_437_clock.h` | 制作词条 | 1-38 | `525acd48eebebfc3...` | complete | 时钟配置函数接口声明头文件，函数与 at32f435_437_clock.c 实现合并 |
| `common/include/at32f435_437_conf.h` | 制作词条 | 1-24 | `0288ee925a8d6c88...` | complete | 芯片外设使能及晶振频率配置头文件，定义 HEXT/HICK 频率及超时阈值 |
| `05_createtask/README.md` | 参考读取 | 1-37 | `b86b8414b7c969a9...` | complete | 了解 05 实验设计目标、任务预期行为、内存预算及验证状态 |
| `common/README.md` | 参考读取 | 1-45 | `447bd7a6fce3dc6e...` | complete | 了解课程公共底层架构约定、板级硬件接线约定、调用限制及失败停机设计 |

### 目录级排除规则

| 排除路径 | 排除原因 |
| --- | --- |
| `05_createtask/mdk_v5/objects/` | Keil 构建产物目录（.o, .crf, .d, .axf, .hex），非源码 |
| `05_createtask/mdk_v5/listings/` | Keil 链接映射与列表文件目录（.map, .lst），非源码 |
| `common/vendor/cmsis/` | ARM CMSIS 官方标准库文件，遵循原则不批量制作词条，解释时按需查阅 |
| `common/vendor/drivers/` | 雅特力官方固件驱动库（at32f435_437_*.c/.h），第三方 SDK 驱动默认不批量制作词条 |
| `common/vendor/freertos/` | FreeRTOS 10.4.3 官方内核及 ARM_CM4F 移植层源码，遵循原则不批量制作词条 |
| `00_board_check/ ~ 29_resource_management/ (除 05 外)` | 其余 27 个独立课程工程，不属于 05_createtask 构建 Target |

## 2. 按文件列出的候选与词条清单

本节按文件列出本次阅读识别的全部候选符号、收录/排除判断、中文名称、声明、详细解释与待确认项。

### 文件：`05_createtask/src/main.c`（收录 6 项）

#### 1. `intervals` (variable) — 任务运行周期配置数组

- **来源**：[`05_createtask/src/main.c:3`](file:///M:/005869/FreeRtos/projects/freertos-learning/05_createtask/src/main.c#L3)
- **作用域**：`05_createtask/src/main.c`
- **声明**：`static const uint32_t intervals[2] = {500,1000};`
- **中文解释**：静态常量数组，保存两个动态 worker 任务各自的运行周期（毫秒）。元素 0 为 500ms（传给 dynamic_a 任务），元素 1 为 1000ms（传给 dynamic_b 任务）。由于任务生命周期与系统相同，参数对象必须具有静态生命周期，以保证任务在解引用传参指针时内存始终有效。
- **人工复核状态**：`pending`

#### 2. `worker` (function) — 动态任务工作函数

- **来源**：[`05_createtask/src/main.c:4`](file:///M:/005869/FreeRtos/projects/freertos-learning/05_createtask/src/main.c#L4)
- **作用域**：`05_createtask/src/main.c`
- **声明**：`static void worker(void *arg)`
- **中文解释**：FreeRTOS 动态创建的任务入口函数。首先从 arg 获取周期配置并在堆上临时分配 64 字节内存，通过串口打印当前任务名、局部变量栈地址、入参地址、堆块地址以及剩余堆空间；随后立即释放临时堆块，进入死循环按周期打印运行次数和任务栈历史高水位（Stack High Water Mark，单位为 4 字节字），并阻塞延时。
- **参数列表**：
  - `arg`: 任务入参指针，指向静态常量 uint32_t 周期值（毫秒）。
- **返回/退出行为**：无返回值（FreeRTOS 任务函数为死循环，不返回）。
- **人工复核状态**：`pending`

#### 3. `local_count` (variable) — 任务局部计数器

- **来源**：[`05_createtask/src/main.c:6`](file:///M:/005869/FreeRtos/projects/freertos-learning/05_createtask/src/main.c#L6)
- **作用域**：`05_createtask/src/main.c::worker:L6:C5`
- **声明**：`uint32_t local_count = 0;`
- **中文解释**：worker 任务的栈局部变量，记录该任务循环执行的次数。同时其地址在启动时被打印，用于展示不同任务拥有各自独立的栈空间（如 dynamic_a 与 dynamic_b 的 local_count 地址不同）。
- **人工复核状态**：`pending`

#### 4. `interval` (variable) — 任务执行周期局部变量

- **来源**：[`05_createtask/src/main.c:7`](file:///M:/005869/FreeRtos/projects/freertos-learning/05_createtask/src/main.c#L7)
- **作用域**：`05_createtask/src/main.c::worker:L7:C5`
- **声明**：`uint32_t interval = *(const uint32_t *)arg;`
- **中文解释**：从任务入参 arg 指针中解引用获取的任务周期值（毫秒），用于后续周期性日志输出与 vTaskDelay 延时。
- **人工复核状态**：`pending`

#### 5. `block` (variable) — 临时堆内存块指针

- **来源**：[`05_createtask/src/main.c:8`](file:///M:/005869/FreeRtos/projects/freertos-learning/05_createtask/src/main.c#L8)
- **作用域**：`05_createtask/src/main.c::worker:L8:C5`
- **声明**：`void *block = pvPortMalloc(64);`
- **中文解释**：任务启动时从 FreeRTOS 堆（heap_4）动态申请的 64 字节内存指针。用于演示堆内存分配与剩余堆空间查询，打印后立即通过 vPortFree 释放。
- **人工复核状态**：`pending`

#### 6. `main` (function) — 主函数

- **来源**：[`05_createtask/src/main.c:20`](file:///M:/005869/FreeRtos/projects/freertos-learning/05_createtask/src/main.c#L20)
- **作用域**：`05_createtask/src/main.c`
- **声明**：`int main(void)`
- **中文解释**：实验程序入口。初始化板级硬件（时钟、LED、串口等），打印实验启动日志，动态创建两个 worker 任务（dynamic_a 周期 500ms，dynamic_b 周期 1000ms，优先级均为 1，栈深 COURSE_LOG_STACK 即 512 字），启动 FreeRTOS 调度器。正常情况下调度器启动后不会返回，若返回则触发 course_fail 停机。
- **返回/退出行为**：正常不返回，返回 0 表示异常退出。
- **人工复核状态**：`pending`

### 文件：`common/include/course.h`（收录 3 项）

#### 1. `COURSE_STACK` (macro) — 课程任务默认栈深度

- **来源**：[`common/include/course.h:13`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course.h#L13)
- **作用域**：`common/include/course.h`
- **声明**：`#define COURSE_STACK 256U`
- **中文解释**：课程常规任务的默认栈空间深度，取值 256（StackType_t，在 ARM Cortex-M4 平台每个字为 4 字节，合 1024 字节）。用于无需复杂格式化输出的轻量级任务。
- **人工复核状态**：`pending`

#### 2. `COURSE_LOG_STACK` (macro) — 带日志任务栈深度

- **来源**：[`common/include/course.h:14`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course.h#L14)
- **作用域**：`common/include/course.h`
- **声明**：`#define COURSE_LOG_STACK 512U`
- **中文解释**：包含串口格式化日志（course_log）输出任务的推荐栈深度，取值 512（StackType_t，合 2048 字节）。因 vsnprintf 本地需要约 160 字节缓冲区及调用栈空间，相比基础任务提供更宽裕的栈防溢出保障。
- **人工复核状态**：`pending`

#### 3. `COURSE_CHECK` (macro) — 课程断言检查宏

- **来源**：[`common/include/course.h:15`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course.h#L15)
- **作用域**：`common/include/course.h`
- **声明**：`#define COURSE_CHECK(x) configASSERT(x)`
- **中文解释**：课程运行期关键操作检查宏，直接映射到 FreeRTOS 的 configASSERT(x)。条件为假时触发断言停机（调用 course_assert_fail），用于校验任务创建、堆内存分配、硬件时钟等关键前置条件是否成功。
- **人工复核状态**：`pending`

### 文件：`common/include/course_board_config.h`（收录 7 项）

#### 1. `COURSE_KEY_INDEX` (macro) — 课程按键候选索引

- **来源**：[`common/include/course_board_config.h:5`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_board_config.h#L5)
- **作用域**：`common/include/course_board_config.h`
- **声明**：`#define COURSE_KEY_INDEX 0`
- **中文解释**：硬件按键引脚映射的候选索引。0 表示未确认实物按键引脚（默认安全值，此时禁用按键中断与输入响应）；1..8 分别对应课程中 8 组候选引脚。需在完成实验 00 识别按键实物后根据对应表修改。
- **待确认项 (Uncertainty)**：> [!WARNING] 按键接线未在当前工程中实测确认，默认保持未配置索引 0。
- **人工复核状态**：`pending`

#### 2. `COURSE_KEY_ACTIVE_LEVEL` (macro) — 按键有效按下电平

- **来源**：[`common/include/course_board_config.h:6`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_board_config.h#L6)
- **作用域**：`common/include/course_board_config.h`
- **声明**：`#define COURSE_KEY_ACTIVE_LEVEL 0`
- **中文解释**：课程按键有效触发时的逻辑电平。0 表示低电平有效（按下导通到 GND）；1 表示高电平有效。
- **待确认项 (Uncertainty)**：> [!WARNING] 依赖实验 00 实测按键原理图极性，当前默认为低电平有效 0。
- **人工复核状态**：`pending`

#### 3. `COURSE_KEY_PULL` (macro) — 按键引脚上下拉配置

- **来源**：[`common/include/course_board_config.h:7`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_board_config.h#L7)
- **作用域**：`common/include/course_board_config.h`
- **声明**：`#define COURSE_KEY_PULL GPIO_PULL_NONE`
- **中文解释**：按键 GPIO 引脚的内置上下拉配置，默认为无上下拉（GPIO_PULL_NONE）。在未确认硬件外部电路之前，避免因错误上下拉造成未知漏电或电平冲突。
- **待确认项 (Uncertainty)**：> [!WARNING] 需结合板载外置上下拉电阻原理图确认。
- **人工复核状态**：`pending`

#### 4. `COURSE_IRQ_PRIORITY` (macro) — 课程外设中断抢占优先级

- **来源**：[`common/include/course_board_config.h:8`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_board_config.h#L8)
- **作用域**：`common/include/course_board_config.h`
- **声明**：`#define COURSE_IRQ_PRIORITY 6`
- **中文解释**：课程自定义外设中断（如按键 EXINT、定时器）使用的 NVIC 抢占优先级，取值 6。在 4 位抢占优先级的 NVIC 分组下，数值越大优先级越低。该值必须大于等于 configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY（5），以确保可在 ISR 中安全调用 FreeRTOS FromISR API。
- **人工复核状态**：`pending`

#### 5. `COURSE_LED_A_PIN` (macro) — 课程 LED A 引脚

- **来源**：[`common/include/course_board_config.h:9`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_board_config.h#L9)
- **作用域**：`common/include/course_board_config.h`
- **声明**：`#define COURSE_LED_A_PIN GPIO_PINS_12`
- **中文解释**：课程板载 LED 0（指示灯 A）对应的 GPIOC 引脚掩码（GPIO_PINS_12，即 PC12）。电路为低电平点亮。
- **人工复核状态**：`pending`

#### 6. `COURSE_LED_B_PIN` (macro) — 课程 LED B 引脚

- **来源**：[`common/include/course_board_config.h:10`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_board_config.h#L10)
- **作用域**：`common/include/course_board_config.h`
- **声明**：`#define COURSE_LED_B_PIN GPIO_PINS_9`
- **中文解释**：课程板载 LED 1（指示灯 B）对应的 GPIOC 引脚掩码（GPIO_PINS_9，即 PC9）。电路为低电平点亮。
- **人工复核状态**：`pending`

#### 7. `COURSE_UART_BAUD` (macro) — 课程串口波特率

- **来源**：[`common/include/course_board_config.h:11`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_board_config.h#L11)
- **作用域**：`common/include/course_board_config.h`
- **声明**：`#define COURSE_UART_BAUD 115200U`
- **中文解释**：课程调试串口（USART1，PB6/TX, PB7/RX）通信波特率，设置为 115200 bps。
- **人工复核状态**：`pending`

### 文件：`common/include/course_hooks.h`（收录 4 项）

#### 1. `course_fault_type` (typedef) — 故障记录结构体类型

- **来源**：[`common/include/course_hooks.h:3`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_hooks.h#L3)
- **作用域**：`common/include/course_hooks.h`
- **声明**：`typedef struct {
    const char *reason;
    const char *file;
    unsigned int line;
} course_fault_type;`
- **中文解释**：记录系统异常停机原因的结构体类型。包含故障描述 reason、触发源文件名 file 以及所在行号 line，便于在死循环停机后通过调试器读取全局变量排查故障。
- **人工复核状态**：`pending`

#### 2. `reason` (variable) — 故障原因字符串指针

- **来源**：[`common/include/course_hooks.h:4`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_hooks.h#L4)
- **作用域**：`common/include/course_hooks.h::course_fault_type`
- **声明**：`const char *reason;`
- **中文解释**：指向引起停机或断言的错误原因描述字符串常量。
- **人工复核状态**：`pending`

#### 3. `file` (variable) — 故障源文件路径指针

- **来源**：[`common/include/course_hooks.h:5`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_hooks.h#L5)
- **作用域**：`common/include/course_hooks.h::course_fault_type`
- **声明**：`const char *file;`
- **中文解释**：触发断言或故障的源文件名指针（通常为 __FILE__ 常量），非断言触发时可为 NULL。
- **人工复核状态**：`pending`

#### 4. `line` (variable) — 故障所在行号

- **来源**：[`common/include/course_hooks.h:6`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_hooks.h#L6)
- **作用域**：`common/include/course_hooks.h::course_fault_type`
- **声明**：`unsigned int line;`
- **中文解释**：触发断言的行号（通常为 __LINE__），非断言触发时为 0。
- **人工复核状态**：`pending`

### 文件：`common/include/course_rtos_config.h`（收录 50 项）

#### 1. `configCPU_CLOCK_HZ` (macro) — CPU时钟频率配置

- **来源**：[`common/include/course_rtos_config.h:8`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L8)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configCPU_CLOCK_HZ system_core_clock`
- **中文解释**：FreeRTOS 系统的 CPU 核心时钟频率，直接绑定到全局变量 system_core_clock（AT32F435 配置为 288MHz）。
- **人工复核状态**：`pending`

#### 2. `configTICK_RATE_HZ` (macro) — 系统滴答节拍率

- **来源**：[`common/include/course_rtos_config.h:9`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L9)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configTICK_RATE_HZ 1000U`
- **中文解释**：FreeRTOS 系统时钟节拍频率，配置为 1000Hz（即每个 tick 周期为 1ms）。
- **人工复核状态**：`pending`

#### 3. `configMAX_PRIORITIES` (macro) — 任务最大优先级数

- **来源**：[`common/include/course_rtos_config.h:10`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L10)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configMAX_PRIORITIES 8`
- **中文解释**：FreeRTOS 支持的最大优先级数量，配置为 8。可用任务优先级范围为 0 到 7，数值越大优先级越高。
- **人工复核状态**：`pending`

#### 4. `configMINIMAL_STACK_SIZE` (macro) — 空闲任务最小栈深度

- **来源**：[`common/include/course_rtos_config.h:11`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L11)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configMINIMAL_STACK_SIZE 256U`
- **中文解释**：FreeRTOS 空闲任务（Idle Task）使用的栈深度，配置为 256（StackType_t，合 1024 字节）。
- **人工复核状态**：`pending`

#### 5. `configTOTAL_HEAP_SIZE` (macro) — FreeRTOS堆内存总大小

- **来源**：[`common/include/course_rtos_config.h:12`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L12)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configTOTAL_HEAP_SIZE (60U * 1024U)`
- **中文解释**：FreeRTOS 动态内存堆（heap_4）的总字节数，配置为 60KiB（60 * 1024 字节），由 ucHeap 数组静态预留。
- **人工复核状态**：`pending`

#### 6. `configMAX_TASK_NAME_LEN` (macro) — 任务名称最大长度

- **来源**：[`common/include/course_rtos_config.h:13`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L13)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configMAX_TASK_NAME_LEN 16`
- **中文解释**：任务可设置名称的最大字符长度（包括结尾空字符），配置为 16。
- **人工复核状态**：`pending`

#### 7. `configUSE_16_BIT_TICKS` (macro) — 16位Tick计数器开关

- **来源**：[`common/include/course_rtos_config.h:14`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L14)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_16_BIT_TICKS 0`
- **中文解释**：系统 Tick 计数值类型配置。0 表示使用 32 位无符号整数表示 Tick 计数（TickType_t 为 uint32_t），适用于 32 位 MCU。
- **人工复核状态**：`pending`

#### 8. `configUSE_PREEMPTION` (macro) — 抢占式调度器开关

- **来源**：[`common/include/course_rtos_config.h:15`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L15)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_PREEMPTION 1`
- **中文解释**：FreeRTOS 调度策略配置。1 表示启用抢占式调度，高优先级就绪任务可立即抢占低优先级运行任务。
- **人工复核状态**：`pending`

#### 9. `configUSE_TIME_SLICING` (macro) — 时间片轮转调度开关

- **来源**：[`common/include/course_rtos_config.h:17`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L17)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_TIME_SLICING 1`
- **中文解释**：同等优先级就绪任务的时间片轮转调度开关。1 表示启用同优先级就绪任务在每个系统 Tick 间轮流执行。
- **人工复核状态**：`pending`

#### 10. `configIDLE_SHOULD_YIELD` (macro) — 空闲任务让出CPU开关

- **来源**：[`common/include/course_rtos_config.h:19`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L19)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configIDLE_SHOULD_YIELD 1`
- **中文解释**：1 表示当存在与空闲任务相同优先级（优先级 0）的用户就绪任务时，空闲任务主动让出 CPU。
- **人工复核状态**：`pending`

#### 11. `configSUPPORT_DYNAMIC_ALLOCATION` (macro) — 支持动态内存分配

- **来源**：[`common/include/course_rtos_config.h:20`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L20)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configSUPPORT_DYNAMIC_ALLOCATION 1`
- **中文解释**：1 表示启用 FreeRTOS 动态任务与对象创建（如 xTaskCreate、pvPortMalloc 等），需使用 heap 实现。
- **人工复核状态**：`pending`

#### 12. `configSUPPORT_STATIC_ALLOCATION` (macro) — 支持静态内存分配

- **来源**：[`common/include/course_rtos_config.h:22`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L22)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configSUPPORT_STATIC_ALLOCATION 0`
- **中文解释**：静态内存分配开关。05 实验中默认为 0（关闭），在后续静态任务创建实验中通过 FreeRTOSConfig.h 显式重定义开启。
- **人工复核状态**：`pending`

#### 13. `configUSE_IDLE_HOOK` (macro) — 空闲任务钩子函数开关

- **来源**：[`common/include/course_rtos_config.h:25`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L25)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_IDLE_HOOK 0`
- **中文解释**：05 实验中默认为 0（关闭空闲任务钩子），由特定实验按需开启。
- **人工复核状态**：`pending`

#### 14. `configUSE_TICK_HOOK` (macro) — 滴答定时器钩子开关

- **来源**：[`common/include/course_rtos_config.h:27`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L27)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_TICK_HOOK 0`
- **中文解释**：配置为 0，不启用每个 Tick 中断执行的钩子函数。
- **人工复核状态**：`pending`

#### 15. `configCHECK_FOR_STACK_OVERFLOW` (macro) — 栈溢出检查级别

- **来源**：[`common/include/course_rtos_config.h:28`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L28)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configCHECK_FOR_STACK_OVERFLOW 2`
- **中文解释**：任务切换时的栈溢出检测级别。2 表示使用方式 2 深度检测（检查栈顶指针及栈尾特征标记字节是否被破坏）。
- **人工复核状态**：`pending`

#### 16. `configUSE_MALLOC_FAILED_HOOK` (macro) — 内存申请失败钩子开关

- **来源**：[`common/include/course_rtos_config.h:29`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L29)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_MALLOC_FAILED_HOOK 1`
- **中文解释**：1 表示当 pvPortMalloc 申请堆内存失败时，调用 vApplicationMallocFailedHook 钩子函数进行停机处理。
- **人工复核状态**：`pending`

#### 17. `configUSE_CO_ROUTINES` (macro) — 协程支持开关

- **来源**：[`common/include/course_rtos_config.h:30`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L30)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_CO_ROUTINES 0`
- **中文解释**：配置为 0，关闭已过时的 FreeRTOS 协程机制。
- **人工复核状态**：`pending`

#### 18. `configUSE_MUTEXES` (macro) — 互斥量支持开关

- **来源**：[`common/include/course_rtos_config.h:31`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L31)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_MUTEXES 1`
- **中文解释**：1 表示启用 FreeRTOS 互斥信号量功能。
- **人工复核状态**：`pending`

#### 19. `configUSE_RECURSIVE_MUTEXES` (macro) — 递归互斥量开关

- **来源**：[`common/include/course_rtos_config.h:33`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L33)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_RECURSIVE_MUTEXES 0`
- **中文解释**：递归互斥量开关，05 实验中默认为 0。
- **人工复核状态**：`pending`

#### 20. `configUSE_COUNTING_SEMAPHORES` (macro) — 计数信号量开关

- **来源**：[`common/include/course_rtos_config.h:36`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L36)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_COUNTING_SEMAPHORES 0`
- **中文解释**：计数型信号量开关，05 实验中默认为 0。
- **人工复核状态**：`pending`

#### 21. `configUSE_QUEUE_SETS` (macro) — 队列集开关

- **来源**：[`common/include/course_rtos_config.h:39`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L39)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_QUEUE_SETS 0`
- **中文解释**：队列集功能开关，05 实验中默认为 0。
- **人工复核状态**：`pending`

#### 22. `configUSE_TASK_NOTIFICATIONS` (macro) — 任务通知开关

- **来源**：[`common/include/course_rtos_config.h:41`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L41)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_TASK_NOTIFICATIONS 1`
- **中文解释**：1 表示启用轻量级 FreeRTOS 任务通知功能。
- **人工复核状态**：`pending`

#### 23. `configUSE_TIMERS` (macro) — 软件定时器开关

- **来源**：[`common/include/course_rtos_config.h:43`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L43)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_TIMERS 0`
- **中文解释**：软件定时器服务开关，05 实验中默认为 0（关闭），开启时由定时器守护任务负责调度。
- **人工复核状态**：`pending`

#### 24. `configTIMER_TASK_PRIORITY` (macro) — 定时器任务优先级

- **来源**：[`common/include/course_rtos_config.h:45`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L45)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configTIMER_TASK_PRIORITY 3`
- **中文解释**：开启软件定时器时守护任务的优先级，配置为 3。
- **人工复核状态**：`pending`

#### 25. `configTIMER_QUEUE_LENGTH` (macro) — 定时器命令队列长度

- **来源**：[`common/include/course_rtos_config.h:46`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L46)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configTIMER_QUEUE_LENGTH 16`
- **中文解释**：软件定时器命令队列的最大容量，配置为 16。
- **人工复核状态**：`pending`

#### 26. `configTIMER_TASK_STACK_DEPTH` (macro) — 定时器任务栈深度

- **来源**：[`common/include/course_rtos_config.h:47`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L47)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configTIMER_TASK_STACK_DEPTH 512U`
- **中文解释**：软件定时器守护任务的栈深度，配置为 512（StackType_t，合 2048 字节）。
- **人工复核状态**：`pending`

#### 27. `configUSE_TRACE_FACILITY` (macro) — 可视化追踪开关

- **来源**：[`common/include/course_rtos_config.h:49`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L49)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_TRACE_FACILITY 0`
- **中文解释**：可视化追踪与调试辅助结构开关，05 实验中默认为 0。
- **人工复核状态**：`pending`

#### 28. `configGENERATE_RUN_TIME_STATS` (macro) — 运行时间统计开关

- **来源**：[`common/include/course_rtos_config.h:52`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L52)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configGENERATE_RUN_TIME_STATS 0`
- **中文解释**：运行时间统计功能开关，05 实验中默认为 0。
- **人工复核状态**：`pending`

#### 29. `configUSE_STATS_FORMATTING_FUNCTIONS` (macro) — 统计信息格式化函数开关

- **来源**：[`common/include/course_rtos_config.h:54`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L54)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configUSE_STATS_FORMATTING_FUNCTIONS 0`
- **中文解释**：统计格式化函数（如 vTaskList）支持开关，配置为 0。
- **人工复核状态**：`pending`

#### 30. `portCONFIGURE_TIMER_FOR_RUN_TIME_STATS` (macro) — 运行统计时基初始化宏

- **来源**：[`common/include/course_rtos_config.h:55`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L55)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define portCONFIGURE_TIMER_FOR_RUN_TIME_STATS() course_stats_init()`
- **中文解释**：映射为 course_stats_init()，用于配置硬件定时器作为高频运行时间统计时基。
- **人工复核状态**：`pending`

#### 31. `portGET_RUN_TIME_COUNTER_VALUE` (macro) — 运行统计时基计数值获取宏

- **来源**：[`common/include/course_rtos_config.h:56`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L56)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define portGET_RUN_TIME_COUNTER_VALUE() course_stats_counter()`
- **中文解释**：映射为 course_stats_counter()，用于获取高频运行时间统计当前计数值。
- **人工复核状态**：`pending`

#### 32. `INCLUDE_vTaskPrioritySet` (macro) — 包含设置任务优先级API宏

- **来源**：[`common/include/course_rtos_config.h:57`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L57)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_vTaskPrioritySet 1`
- **中文解释**：配置为 1，编译包含 vTaskPrioritySet API 函数。
- **人工复核状态**：`pending`

#### 33. `INCLUDE_uxTaskPriorityGet` (macro) — 包含获取任务优先级API宏

- **来源**：[`common/include/course_rtos_config.h:58`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L58)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_uxTaskPriorityGet 1`
- **中文解释**：配置为 1，编译包含 uxTaskPriorityGet API 函数。
- **人工复核状态**：`pending`

#### 34. `INCLUDE_vTaskDelete` (macro) — 包含删除任务API宏

- **来源**：[`common/include/course_rtos_config.h:59`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L59)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_vTaskDelete 1`
- **中文解释**：配置为 1，编译包含 vTaskDelete API 函数。
- **人工复核状态**：`pending`

#### 35. `INCLUDE_vTaskSuspend` (macro) — 包含挂起任务API宏

- **来源**：[`common/include/course_rtos_config.h:60`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L60)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_vTaskSuspend 1`
- **中文解释**：配置为 1，编译包含 vTaskSuspend API 函数。
- **人工复核状态**：`pending`

#### 36. `INCLUDE_vTaskDelay` (macro) — 包含任务延时API宏

- **来源**：[`common/include/course_rtos_config.h:61`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L61)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_vTaskDelay 1`
- **中文解释**：配置为 1，编译包含相对延时函数 vTaskDelay。
- **人工复核状态**：`pending`

#### 37. `INCLUDE_vTaskDelayUntil` (macro) — 包含绝对延时API宏

- **来源**：[`common/include/course_rtos_config.h:62`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L62)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_vTaskDelayUntil 1`
- **中文解释**：配置为 1，编译包含绝对周期延时函数 vTaskDelayUntil。
- **人工复核状态**：`pending`

#### 38. `INCLUDE_xTaskGetSchedulerState` (macro) — 包含获取调度器状态API宏

- **来源**：[`common/include/course_rtos_config.h:63`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L63)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_xTaskGetSchedulerState 1`
- **中文解释**：配置为 1，编译包含 xTaskGetSchedulerState API 函数，用于判断调度器是否正在运行。
- **人工复核状态**：`pending`

#### 39. `INCLUDE_xTaskGetCurrentTaskHandle` (macro) — 包含获取当前任务句柄API宏

- **来源**：[`common/include/course_rtos_config.h:64`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L64)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_xTaskGetCurrentTaskHandle 1`
- **中文解释**：配置为 1，编译包含 xTaskGetCurrentTaskHandle API 函数。
- **人工复核状态**：`pending`

#### 40. `INCLUDE_eTaskGetState` (macro) — 包含获取任务状态API宏

- **来源**：[`common/include/course_rtos_config.h:65`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L65)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_eTaskGetState 1`
- **中文解释**：配置为 1，编译包含 eTaskGetState API 函数。
- **人工复核状态**：`pending`

#### 41. `INCLUDE_uxTaskGetStackHighWaterMark` (macro) — 包含获取栈历史高水位API宏

- **来源**：[`common/include/course_rtos_config.h:66`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L66)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define INCLUDE_uxTaskGetStackHighWaterMark 1`
- **中文解释**：配置为 1，编译包含 uxTaskGetStackHighWaterMark API 函数，用于监测任务剩余栈最小历史字数。
- **人工复核状态**：`pending`

#### 42. `configPRIO_BITS` (macro) — 硬件中断优先级位数

- **来源**：[`common/include/course_rtos_config.h:67`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L67)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configPRIO_BITS 4`
- **中文解释**：Cortex-M4 硬件 NVIC 中断优先级所实现的位数，AT32F435 实现为 4 位（16 个抢占等级）。
- **人工复核状态**：`pending`

#### 43. `configLIBRARY_LOWEST_INTERRUPT_PRIORITY` (macro) — 最低中断优先级数值

- **来源**：[`common/include/course_rtos_config.h:68`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L68)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configLIBRARY_LOWEST_INTERRUPT_PRIORITY 15`
- **中文解释**：库函数使用的最低硬件中断优先级数值，4 位下为 15。
- **人工复核状态**：`pending`

#### 44. `configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY` (macro) — 可调用API最高中断优先级数值

- **来源**：[`common/include/course_rtos_config.h:69`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L69)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY 5`
- **中文解释**：允许安全调用 FreeRTOS FromISR API 的最高中断优先级数值，配置为 5。0~4 为不可屏蔽系统调用中断，不能调用任何 RTOS API。
- **人工复核状态**：`pending`

#### 45. `configKERNEL_INTERRUPT_PRIORITY` (macro) — 内核中断优先级寄存器值

- **来源**：[`common/include/course_rtos_config.h:70`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L70)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configKERNEL_INTERRUPT_PRIORITY (15U << (8 - configPRIO_BITS))`
- **中文解释**：内核底层中断（PendSV、SysTick）的硬件寄存器移位值，设为最低优先级 (15U << (8 - configPRIO_BITS))。
- **人工复核状态**：`pending`

#### 46. `configMAX_SYSCALL_INTERRUPT_PRIORITY` (macro) — 系统调用中断屏蔽寄存器值

- **来源**：[`common/include/course_rtos_config.h:71`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L71)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configMAX_SYSCALL_INTERRUPT_PRIORITY (5 << (8 - configPRIO_BITS))`
- **中文解释**：进入临界区时写入 BASEPRI 寄存器的屏蔽值，设为 (5 << (8 - configPRIO_BITS))，屏蔽优先级 5~15 的中断。
- **人工复核状态**：`pending`

#### 47. `configASSERT` (macro) — FreeRTOS断言宏

- **来源**：[`common/include/course_rtos_config.h:72`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L72)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define configASSERT(x) do { if (!(x)) course_assert_fail(__FILE__, __LINE__); } while (0)`
- **中文解释**：FreeRTOS 内部断言宏实现，当表达式为假时调用 course_assert_fail(__FILE__, __LINE__) 停机。
- **人工复核状态**：`pending`

#### 48. `vPortSVCHandler` (macro) — SVC异常处理函数映射宏

- **来源**：[`common/include/course_rtos_config.h:73`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L73)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define vPortSVCHandler SVC_Handler`
- **中文解释**：将 FreeRTOS 的 SVC 异常处理函数重命名映射为启动文件中的 SVC_Handler 中断向量。
- **人工复核状态**：`pending`

#### 49. `xPortPendSVHandler` (macro) — PendSV异常处理函数映射宏

- **来源**：[`common/include/course_rtos_config.h:74`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L74)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define xPortPendSVHandler PendSV_Handler`
- **中文解释**：将 FreeRTOS 的上下文切换 PendSV 处理函数重命名映射为启动文件中的 PendSV_Handler 中断向量。
- **人工复核状态**：`pending`

#### 50. `xPortSysTickHandler` (macro) — SysTick异常处理函数映射宏

- **来源**：[`common/include/course_rtos_config.h:75`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/course_rtos_config.h#L75)
- **作用域**：`common/include/course_rtos_config.h`
- **声明**：`#define xPortSysTickHandler SysTick_Handler`
- **中文解释**：将 FreeRTOS 的滴答定时器中断函数重命名映射为启动文件中的 SysTick_Handler 中断向量。
- **人工复核状态**：`pending`

### 文件：`common/include/at32f435_437_conf.h`（收录 3 项）

#### 1. `HEXT_VALUE` (macro) — 外部高速晶振标称频率

- **来源**：[`common/include/at32f435_437_conf.h:3`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/at32f435_437_conf.h#L3)
- **作用域**：`common/include/at32f435_437_conf.h`
- **声明**：`#define HEXT_VALUE 8000000U`
- **中文解释**：板载外部高速晶振（HEXT）的标称频率常数，定义为 8000000U（8MHz）。
- **人工复核状态**：`pending`

#### 2. `HEXT_STARTUP_TIMEOUT` (macro) — 外部晶振起振超时阈值

- **来源**：[`common/include/at32f435_437_conf.h:4`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/at32f435_437_conf.h#L4)
- **作用域**：`common/include/at32f435_437_conf.h`
- **声明**：`#define HEXT_STARTUP_TIMEOUT 0x3000U`
- **中文解释**：外部晶振稳定状态等待循环的最大超时计数值，定义为 0x3000U。
- **人工复核状态**：`pending`

#### 3. `HICK_VALUE` (macro) — 内部高速RC振荡器频率

- **来源**：[`common/include/at32f435_437_conf.h:5`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/include/at32f435_437_conf.h#L5)
- **作用域**：`common/include/at32f435_437_conf.h`
- **声明**：`#define HICK_VALUE 8000000U`
- **中文解释**：芯片内部高速 RC 振荡器（HICK）标称频率，定义为 8000000U（8MHz）。
- **人工复核状态**：`pending`

### 文件：`common/platform/at32f435_437_clock.c`（收录 1 项）

#### 1. `system_clock_config` (function) — 系统时钟配置函数

- **来源**：[`common/platform/at32f435_437_clock.c:57`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/at32f435_437_clock.c#L57)
- **作用域**：`common/platform/at32f435_437_clock.c`
- **声明**：`void system_clock_config(void)`
- **中文解释**：初始化 AT32F435 系统时钟。配置内部 LDO 稳压输出 1.3V，Flash 访问分频为 3；使能 8MHz 外部高速晶振（HEXT）作为 PLL 来源，配置倍频系数（ns=72, ms=1, fr=2）使 PLL 输出 288MHz；配置 AHB 1 分频（288MHz）、APB1/APB2 2 分频（144MHz），最后切换系统时钟源为 PLL。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

### 文件：`common/platform/course_board.c`（收录 36 项）

#### 1. `key_pin_type` (typedef) — 按键引脚映射结构体类型

- **来源**：[`common/platform/course_board.c:6`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L6)
- **作用域**：`common/platform/course_board.c`
- **声明**：`typedef struct {
    gpio_type *port;
    uint16_t pin;
    scfg_port_source_type source;
    scfg_pins_source_type line;
    IRQn_Type irq;
} key_pin_type;`
- **中文解释**：课程内部候选按键引脚硬件参数结构体。封装候选按键的 GPIO 端口、引脚掩码、SCFG 中断源端口/引脚以及对应的 NVIC 中断通道号。
- **人工复核状态**：`pending`

#### 2. `port` (variable) — GPIO端口指针

- **来源**：[`common/platform/course_board.c:7`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L7)
- **作用域**：`common/platform/course_board.c::key_pin_type`
- **声明**：`gpio_type *port;`
- **中文解释**：按键引脚所属的 GPIO 端口外设基地址指针（如 GPIOB, GPIOD, GPIOE）。
- **人工复核状态**：`pending`

#### 3. `pin` (variable) — GPIO引脚掩码

- **来源**：[`common/platform/course_board.c:8`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L8)
- **作用域**：`common/platform/course_board.c::key_pin_type`
- **声明**：`uint16_t pin;`
- **中文解释**：按键引脚在该端口中的位掩码（如 GPIO_PINS_13）。
- **人工复核状态**：`pending`

#### 4. `source` (variable) — SCFG端口中断源

- **来源**：[`common/platform/course_board.c:9`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L9)
- **作用域**：`common/platform/course_board.c::key_pin_type`
- **声明**：`scfg_port_source_type source;`
- **中文解释**：外部中断配置寄存器使用的端口源枚举值（如 SCFG_PORT_SOURCE_GPIOB）。
- **人工复核状态**：`pending`

#### 5. `line` (variable) — SCFG引脚中断线源

- **来源**：[`common/platform/course_board.c:10`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L10)
- **作用域**：`common/platform/course_board.c::key_pin_type`
- **声明**：`scfg_pins_source_type line;`
- **中文解释**：外部中断配置寄存器使用的引脚线源枚举值（如 SCFG_PINS_SOURCE13）。
- **人工复核状态**：`pending`

#### 6. `irq` (variable) — NVIC外部中断向量号

- **来源**：[`common/platform/course_board.c:11`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L11)
- **作用域**：`common/platform/course_board.c::key_pin_type`
- **声明**：`IRQn_Type irq;`
- **中文解释**：该按键引脚外部中断对应的 Cortex-M NVIC 中断号（如 EXINT15_10_IRQn）。
- **人工复核状态**：`pending`

#### 7. `keys` (variable) — 候选按键硬件映射表

- **来源**：[`common/platform/course_board.c:14`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L14)
- **作用域**：`common/platform/course_board.c`
- **声明**：`static const key_pin_type keys[8] = { ... };`
- **中文解释**：静态常量数组，保存 8 组候选按键的 GPIO 与 EXINT 映射配置。源自集成驱动而非已核实原理图，用于课程 00 的引脚扫描与识别。
- **待确认项 (Uncertainty)**：> [!WARNING] 候选引脚来自历史集成驱动，并非经验证的官方原理图，按键实物对应关系待测。
- **人工复核状态**：`pending`

#### 8. `board_ready` (variable) — 板级初始化完成就绪标志

- **来源**：[`common/platform/course_board.c:24`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L24)
- **作用域**：`common/platform/course_board.c`
- **声明**：`static int board_ready;`
- **中文解释**：静态标志变量。在 course_board_init() 执行完毕后置 1。course_uart_write 在输出前检查此标志，防止板级时钟和串口外设未就绪时发生硬件异常。
- **人工复核状态**：`pending`

#### 9. `course_led_set` (function) — 设置LED亮灭状态

- **来源**：[`common/platform/course_board.c:26`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L26)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_led_set(unsigned int led, int on)`
- **中文解释**：控制板载 LED 点亮或熄灭。参数 led 为 0 选择 LED A（PC12），非 0 选择 LED B（PC9）。硬件为低电平点亮，函数内部将 on=1 写入低电平（FALSE），on=0 写入高电平（TRUE）。
- **参数列表**：
  - `led`: LED 编号，0 为 LED A，非 0 为 LED B。
  - `on`: 期望状态，非 0 点亮，0 熄灭。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 10. `course_led_toggle` (function) — 翻转LED电平状态

- **来源**：[`common/platform/course_board.c:31`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L31)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_led_toggle(unsigned int led)`
- **中文解释**：翻转指定板载 LED 的输出电平。通过读取 GPIOC 输出数据寄存器（odt）当前引脚状态进行取反写入。
- **参数列表**：
  - `led`: LED 编号，0 为 LED A，非 0 为 LED B。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 11. `course_uart_write` (function) — 串口字符串轮询发送

- **来源**：[`common/platform/course_board.c:36`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L36)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_uart_write(const char *text)`
- **中文解释**：通过 USART1 轮询发送以空字符结尾的字符串。发送前核对 board_ready 标志；每个字符循环等待发送数据寄存器空中断标志（USART_TDBE_FLAG）后写入。无缓冲与中断驱动，发送长文本会占用 CPU。
- **参数列表**：
  - `text`: 待发送的以 null 结尾的字符串指针。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 12. `course_uart_read` (function) — 串口单字节轮询接收

- **来源**：[`common/platform/course_board.c:44`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L44)
- **作用域**：`common/platform/course_board.c`
- **声明**：`int course_uart_read(uint8_t *byte)`
- **中文解释**：从 USART1 尝试非阻塞读取一个字节。如果接收数据寄存器非空标志（USART_RDBF_FLAG）未置位则立即返回 0；置位则读取该字节存入 byte 并返回 1。
- **参数列表**：
  - `byte`: 接收字节存放地址指针。
- **返回/退出行为**：1 表示成功接收到一个字节，0 表示无数据。
- **人工复核状态**：`pending`

#### 13. `course_log` (function) — 课程格式化日志打印

- **来源**：[`common/platform/course_board.c:50`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L50)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_log(const char *format, ...)`
- **中文解释**：课程统一串口格式化日志输出函数。本地提供 160 字节栈缓冲区，通过 vsnprintf 格式化。要求仅在线程模式调用（断言 __get_IPSR() == 0）。若调度器处于运行状态，发送期间调用 vTaskSuspendAll() 暂停任务调度防止输出混叠，但保持中断开启；发送后追加换行并恢复调度。禁止在中断或临界区中调用。
- **参数列表**：
  - `format`: printf 风格的格式化字符串指针。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 14. `buffer` (variable) — 日志格式化缓冲区

- **来源**：[`common/platform/course_board.c:52`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L52)
- **作用域**：`common/platform/course_board.c::course_log:L52:C10`
- **声明**：`char buffer[160];`
- **中文解释**：栈上分配的 160 字节临时字符缓冲区，用于 vsnprintf 格式化输出。超长日志会被截断并强制末尾赋空字符。
- **人工复核状态**：`pending`

#### 15. `running` (variable) — 调度器运行状态标志

- **来源**：[`common/platform/course_board.c:54`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L54)
- **作用域**：`common/platform/course_board.c::course_log:L54:C16`
- **声明**：`BaseType_t running;`
- **中文解释**：记录调用日志输出时 FreeRTOS 调度器是否处于 taskSCHEDULER_RUNNING 状态，用于决定输出前后是否调用 vTaskSuspendAll / xTaskResumeAll。
- **人工复核状态**：`pending`

#### 16. `course_board_init` (function) — 板级外设基础初始化

- **来源**：[`common/platform/course_board.c:68`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L68)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_board_init(void)`
- **中文解释**：课程板级硬件一站式初始化函数。配置 288MHz 主频、更新 system_core_clock、配置 NVIC 为 4 位全抢占优先级分组；开启 GPIOC、GPIOB、USART1 外设时钟；配置 PC12/PC9 为推挽输出（默认关闭 LED）；配置 PB6/PB7 复用为 USART1 TX/RX 并使能 115200 波特率串口；开启 Cortex-M DWT 周期计数器用于微秒级延迟；最后置 board_ready=1 并校验 288MHz 主频及打印启动日志。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 17. `course_busy_ms` (function) — DWT忙循环延时

- **来源**：[`common/platform/course_board.c:102`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L102)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_busy_ms(uint32_t ms)`
- **中文解释**：基于 ARM Cortex-M DWT CYCCNT 周期计数器的硬件死循环延时。用于在教学实验中模拟可控的纯 CPU 负载（建议 <=200ms）。注意该函数不主动让出 CPU，被中断或抢占的时间也会计入总等待，不可用于业务延时。
- **参数列表**：
  - `ms`: 期望忙等待的毫秒数。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 18. `start` (variable) — 忙等待起始时钟周期计数

- **来源**：[`common/platform/course_board.c:104`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L104)
- **作用域**：`common/platform/course_board.c::course_busy_ms:L104:C14`
- **声明**：`uint32_t start = DWT->CYCCNT;`
- **中文解释**：记录进入忙等待函数时 DWT CYCCNT 硬件计数器的初始值。
- **人工复核状态**：`pending`

#### 19. `cycles` (variable) — 忙等待目标时钟周期总数

- **来源**：[`common/platform/course_board.c:105`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L105)
- **作用域**：`common/platform/course_board.c::course_busy_ms:L105:C14`
- **声明**：`uint32_t cycles = (system_core_clock / 1000U) * ms;`
- **中文解释**：根据 system_core_clock / 1000U * ms 计算得出的目标 CPU 周期数。
- **人工复核状态**：`pending`

#### 20. `key_input` (function) — 初始化单个按键输入引脚

- **来源**：[`common/platform/course_board.c:109`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L109)
- **作用域**：`common/platform/course_board.c`
- **声明**：`static void key_input(const key_pin_type *key)`
- **中文解释**：内部静态辅助函数。开启对应 GPIO 端口时钟，将指定的按键引脚配置为浮空或配置的上下拉输入模式。
- **参数列表**：
  - `key`: 指向候选按键配置信息的结构体指针。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 21. `course_keys_probe_init` (function) — 初始化全部候选按键探测引脚

- **来源**：[`common/platform/course_board.c:121`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L121)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_keys_probe_init(void)`
- **中文解释**：将 8 组候选按键对应的 GPIO 引脚全部初始化为输入状态，用于实验 00 的探测扫描。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 22. `course_keys_raw` (function) — 读取全部候选按键原始电平掩码

- **来源**：[`common/platform/course_board.c:126`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L126)
- **作用域**：`common/platform/course_board.c`
- **声明**：`uint32_t course_keys_raw(void)`
- **中文解释**：轮询读取全部 8 组候选按键引脚的当前输入电平，第 i 位为 1 表示引脚为高电平，为 0 表示低电平。
- **返回/退出行为**：包含 8 个候选引脚电平状态的 32 位位掩码。
- **人工复核状态**：`pending`

#### 23. `course_key_ready` (function) — 检查按键引脚是否已配置

- **来源**：[`common/platform/course_board.c:135`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L135)
- **作用域**：`common/platform/course_board.c`
- **声明**：`int course_key_ready(void)`
- **中文解释**：判断 COURSE_KEY_INDEX 宏是否不等于 0。为 0 说明按键引脚仍未确认，返回 0；已指定按键候选（1..8）则返回 1。
- **返回/退出行为**：1 表示按键引脚已确认选择，0 表示保持默认未确认索引 0。
- **人工复核状态**：`pending`

#### 24. `course_key_input_init` (function) — 初始化确认的按键输入引脚

- **来源**：[`common/platform/course_board.c:136`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L136)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_key_input_init(void)`
- **中文解释**：若 course_key_ready() 为真，则将 COURSE_KEY_INDEX 选中的单个按键引脚配置为 GPIO 输入。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 25. `course_key_pressed` (function) — 读取当前按键是否按下

- **来源**：[`common/platform/course_board.c:140`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L140)
- **作用域**：`common/platform/course_board.c`
- **声明**：`int course_key_pressed(void)`
- **中文解释**：读取确认的按键引脚电平，判断是否与 COURSE_KEY_ACTIVE_LEVEL 匹配。匹配返回 1（已按下），未确认或未按下返回 0。
- **返回/退出行为**：1 表示按键当前处于按下状态，0 表示未按下或按键未配置。
- **人工复核状态**：`pending`

#### 26. `course_key_irq_init` (function) — 初始化按键外部中断

- **来源**：[`common/platform/course_board.c:149`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L149)
- **作用域**：`common/platform/course_board.c`
- **声明**：`int course_key_irq_init(void)`
- **中文解释**：为已确认的按键引脚配置 EXINT 外部中断。使能 SCFG 时钟并映射引脚中断线，配置双边沿触发中断，在 NVIC 中使能对应 IRQ（抢占优先级配置为 COURSE_IRQ_PRIORITY 即 6）。成功返回 1，若按键未就绪返回 0。
- **返回/退出行为**：1 表示中断配置成功，0 表示按键未确认未执行配置。
- **人工复核状态**：`pending`

#### 27. `course_key_isr` (function) — 按键中断弱回调函数

- **来源**：[`common/platform/course_board.c:168`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L168)
- **作用域**：`common/platform/course_board.c`
- **声明**：`__weak void course_key_isr(void)`
- **中文解释**：课程按键中断触发后的公共弱定义（__weak）回调接口。默认空实现，由具体实验（如实验 27）提供强实现以执行信号量释放等操作。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 28. `key_irq_dispatch` (function) — 按键中断分发处理

- **来源**：[`common/platform/course_board.c:169`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L169)
- **作用域**：`common/platform/course_board.c`
- **声明**：`static void key_irq_dispatch(void)`
- **中文解释**：内部静态中断分发函数。检查并清除选中按键引脚对应的 EXINT 中断挂起标志，随后调用 course_key_isr() 回调。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 29. `EXINT1_IRQHandler` (function) — 外部中断线1中断服务函数

- **来源**：[`common/platform/course_board.c:179`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L179)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void EXINT1_IRQHandler(void)`
- **中文解释**：EXINT 线 1 中断向量入口函数，直接转调 key_irq_dispatch() 处理按键事件。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 30. `EXINT2_IRQHandler` (function) — 外部中断线2中断服务函数

- **来源**：[`common/platform/course_board.c:180`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L180)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void EXINT2_IRQHandler(void)`
- **中文解释**：EXINT 线 2 中断向量入口函数，直接转调 key_irq_dispatch() 处理按键事件。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 31. `EXINT4_IRQHandler` (function) — 外部中断线4中断服务函数

- **来源**：[`common/platform/course_board.c:181`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L181)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void EXINT4_IRQHandler(void)`
- **中文解释**：EXINT 线 4 中断向量入口函数，直接转调 key_irq_dispatch() 处理按键事件。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 32. `EXINT15_10_IRQHandler` (function) — 外部中断线15至10中断服务函数

- **来源**：[`common/platform/course_board.c:182`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L182)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void EXINT15_10_IRQHandler(void)`
- **中文解释**：EXINT 线 15~10 共享中断向量入口函数，直接转调 key_irq_dispatch() 处理按键事件。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 33. `course_stats_init` (function) — 运行时间统计定时器初始化

- **来源**：[`common/platform/course_board.c:184`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L184)
- **作用域**：`common/platform/course_board.c`
- **声明**：`void course_stats_init(void)`
- **中文解释**：为 FreeRTOS 任务运行时间统计功能初始化高频时基。使能 TMR2 硬件定时器，配置为 32 位向上自由计数模式，分频至 10kHz 频率，最大计数值 0xFFFFFFFFU，约 119 小时回绕，不开启中断。
- **返回/退出行为**：无返回值。
- **人工复核状态**：`pending`

#### 34. `course_stats_counter` (function) — 获取运行时间统计计数器值

- **来源**：[`common/platform/course_board.c:198`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L198)
- **作用域**：`common/platform/course_board.c`
- **声明**：`uint32_t course_stats_counter(void)`
- **中文解释**：读取并返回 TMR2 32 位定时器的当前自由运行计数值，作为 portGET_RUN_TIME_COUNTER_VALUE 的实现。
- **返回/退出行为**：TMR2 当前 32 位无符号计数值。
- **人工复核状态**：`pending`

#### 35. `mask` (variable) — 候选按键电平位掩码

- **来源**：[`common/platform/course_board.c:129`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L129)
- **作用域**：`common/platform/course_board.c::course_keys_raw:L129:C5`
- **声明**：`uint32_t mask = 0;`
- **中文解释**：course_keys_raw 函数内的局部变量。用于通过循环逐位记录 8 组候选引脚当前的原始输入电平（高电平置 1，低电平置 0），形成 32 位位掩码返回给调用者。
- **人工复核状态**：`pending`

#### 36. `timer_clock` (variable) — 统计定时器基准时钟频率

- **来源**：[`common/platform/course_board.c:187`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_board.c#L187)
- **作用域**：`common/platform/course_board.c::course_stats_init:L187:C5`
- **声明**：`uint32_t timer_clock;`
- **中文解释**：course_stats_init 函数内的局部变量。保存根据 APB1 预分频系数计算得到的 TMR2 定时器输入基准时钟频率。当 APB1 预分频不为 1 时，定时器时钟为 APB1 频率的 2 倍（即 144MHz * 2 = 288MHz），用于配置 10kHz 统计时基。
- **人工复核状态**：`pending`

### 文件：`common/platform/course_hooks.c`（收录 12 项）

#### 1. `course_last_fault` (variable) — 最近故障记录全局变量

- **来源**：[`common/platform/course_hooks.c:2`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L2)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`volatile course_fault_type course_last_fault;`
- **中文解释**：volatile 修饰的全局变量，记录系统最近一次异常停机的详细信息（原因、源文件名、行号）。即使输出系统瘫痪，也可通过调试器直接读取该变量排查故障。
- **人工复核状态**：`pending`

#### 2. `stop` (function) — 故障停机处理函数

- **来源**：[`common/platform/course_hooks.c:3`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L3)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`static void stop(const char *reason, const char *file, unsigned int line)`
- **中文解释**：静态内部停机函数。首先执行 __disable_irq() 禁用全局中断，记录 fault 信息到 course_last_fault，点亮板载全部 LED（LED 0 与 LED 1），直接通过轮询串口输出原始 FAULT 错误文本，最后进入死循环停机。避免在损坏的栈或堆上进行复杂格式化或加锁。
- **参数列表**：
  - `reason`: 故障简短原因文本指针。
  - `file`: 发生故障的源文件名指针（断言时提供，其余为 0）。
  - `line`: 发生故障的源文件行号。
- **返回/退出行为**：不返回（死循环）。
- **人工复核状态**：`pending`

#### 3. `course_fail` (function) — 课程致命错误停机函数

- **来源**：[`common/platform/course_hooks.c:17`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L17)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void course_fail(const char *reason)`
- **中文解释**：课程主动报告致命错误并停机接口，内部调用 stop(reason, 0, 0)。用于调度器意外返回等不可恢复异常。
- **参数列表**：
  - `reason`: 错误描述原因字符串指针。
- **返回/退出行为**：不返回。
- **人工复核状态**：`pending`

#### 4. `course_assert_fail` (function) — 课程断言失败停机函数

- **来源**：[`common/platform/course_hooks.c:18`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L18)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void course_assert_fail(const char *file, unsigned int line)`
- **中文解释**：断言失败处理回调函数，由 COURSE_CHECK 或 configASSERT 宏在条件为假时触发。内部调用 stop("assert", file, line)。
- **参数列表**：
  - `file`: 断言失败所在的源文件名。
  - `line`: 断言失败所在的行号。
- **返回/退出行为**：不返回。
- **人工复核状态**：`pending`

#### 5. `vApplicationMallocFailedHook` (function) — 堆内存分配失败钩子函数

- **来源**：[`common/platform/course_hooks.c:19`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L19)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void vApplicationMallocFailedHook(void)`
- **中文解释**：FreeRTOS 动态内存申请失败时的标准回调钩子（需 configUSE_MALLOC_FAILED_HOOK=1）。内部调用 stop("allocation failed", 0, 0) 安全停机。
- **返回/退出行为**：不返回。
- **人工复核状态**：`pending`

#### 6. `vApplicationStackOverflowHook` (function) — 任务栈溢出钩子函数

- **来源**：[`common/platform/course_hooks.c:20`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L20)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void vApplicationStackOverflowHook(TaskHandle_t task, char *name)`
- **中文解释**：FreeRTOS 任务栈溢出时的标准回调钩子（需 configCHECK_FOR_STACK_OVERFLOW > 0）。内部调用 stop("stack overflow", 0, 0) 安全停机。
- **参数列表**：
  - `task`: 发生栈溢出的任务句柄。
  - `name`: 发生栈溢出的任务名称字符串指针。
- **返回/退出行为**：不返回。
- **人工复核状态**：`pending`

#### 7. `HardFault_Handler` (function) — 硬件故障异常中断服务函数

- **来源**：[`common/platform/course_hooks.c:26`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L26)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void HardFault_Handler(void)`
- **中文解释**：Cortex-M4 硬件 HardFault 中断入口，调用 stop("HardFault", 0, 0) 进行板载指示与死循环停机。
- **返回/退出行为**：不返回。
- **人工复核状态**：`pending`

#### 8. `MemManage_Handler` (function) — 存储管理故障异常中断服务函数

- **来源**：[`common/platform/course_hooks.c:27`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L27)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void MemManage_Handler(void)`
- **中文解释**：Cortex-M4 MPU/存储保护违规中断入口，调用 stop("MemManage", 0, 0) 停机。
- **返回/退出行为**：不返回。
- **人工复核状态**：`pending`

#### 9. `BusFault_Handler` (function) — 总线故障异常中断服务函数

- **来源**：[`common/platform/course_hooks.c:28`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L28)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void BusFault_Handler(void)`
- **中文解释**：Cortex-M4 总线预取或数据访问错误中断入口，调用 stop("BusFault", 0, 0) 停机。
- **返回/退出行为**：不返回。
- **人工复核状态**：`pending`

#### 10. `UsageFault_Handler` (function) — 用法故障异常中断服务函数

- **来源**：[`common/platform/course_hooks.c:29`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L29)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void UsageFault_Handler(void)`
- **中文解释**：Cortex-M4 未定义指令或除以零等用法故障中断入口，调用 stop("UsageFault", 0, 0) 停机。
- **返回/退出行为**：不返回。
- **人工复核状态**：`pending`

#### 11. `vApplicationGetIdleTaskMemory` (function) — 获取空闲任务静态内存回调

- **来源**：[`common/platform/course_hooks.c:31`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L31)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void vApplicationGetIdleTaskMemory(StaticTask_t **tcb, StackType_t **stack, uint32_t *size)`
- **中文解释**：FreeRTOS 静态分配开启（configSUPPORT_STATIC_ALLOCATION=1）时内核调用的内存提供接口。提供内部静态 TCB 结构体 idle_tcb 及静态栈数组 idle_stack 的指针与大小。
- **参数列表**：
  - `tcb`: 用于接收空闲任务 TCB 指针的二级指针。
  - `stack`: 用于接收空闲任务栈数组指针的二级指针。
  - `size`: 用于接收空闲任务栈深度（字数）的指针。
- **返回/退出行为**：无返回值。
- **待确认项 (Uncertainty)**：> [!WARNING] 条件编译：当前实验中 configSUPPORT_STATIC_ALLOCATION 默认为 0，仅在开启静态分配时参与编译。
- **人工复核状态**：`pending`

#### 12. `vApplicationGetTimerTaskMemory` (function) — 获取定时器守护任务静态内存回调

- **来源**：[`common/platform/course_hooks.c:38`](file:///M:/005869/FreeRtos/projects/freertos-learning/common/platform/course_hooks.c#L38)
- **作用域**：`common/platform/course_hooks.c`
- **声明**：`void vApplicationGetTimerTaskMemory(StaticTask_t **tcb, StackType_t **stack, uint32_t *size)`
- **中文解释**：FreeRTOS 静态分配且开启软件定时器（configUSE_TIMERS=1）时内核调用的内存提供接口。提供内部静态 TCB 结构体 timer_tcb 及静态栈数组 timer_stack 的指针与大小。
- **参数列表**：
  - `tcb`: 用于接收定时器任务 TCB 指针的二级指针。
  - `stack`: 用于接收定时器任务栈数组指针的二级指针。
  - `size`: 用于接收定时器任务栈深度（字数）的指针。
- **返回/退出行为**：无返回值。
- **待确认项 (Uncertainty)**：> [!WARNING] 条件编译：当前实验中 configSUPPORT_STATIC_ALLOCATION 与 configUSE_TIMERS 默认为 0，仅在静态软件定时器开启时参与编译。
- **人工复核状态**：`pending`

### 文件内排除项汇总

| 文件 | 排除符号/类别 | 排除理由 |
| --- | --- | --- |
| `05_createtask/inc/FreeRTOSConfig.h` | `FREERTOS_CONFIG_H` | 头文件防重复包含保护宏，无独立业务或配置含义 |
| `common/include/course.h` | `COURSE_H` | 头文件防重复包含保护宏 |
| `common/include/course_board_config.h` | `COURSE_BOARD_CONFIG_H` | 头文件防重复包含保护宏 |
| `common/include/course_board.h` | `COURSE_BOARD_H` | 头文件防重复包含保护宏；声明与实现合并至 course_board.c |
| `common/include/course_hooks.h` | `COURSE_HOOKS_H` | 头文件防重复包含保护宏；声明与实现合并至 course_hooks.c |
| `common/include/course_rtos_config.h` | `COURSE_RTOS_CONFIG_H` | 头文件防重复包含保护宏 |
| `common/include/at32f435_437_clock.h` | `__AT32F435_437_CLOCK_H` | 头文件防重复包含保护宏；声明与实现合并至 at32f435_437_clock.c |
| `common/include/at32f435_437_conf.h` | `COURSE_AT32_CONF_H` | 头文件防重复包含保护宏 |
| `common/include/at32f435_437_conf.h` | 外设使能宏 (`CRM_MODULE_ENABLED` 等 9 项) | 固件库头文件条件包含开关，仅作为库结构开关，不具备运行时或业务配置属性 |
| `common/platform/course_board.c` | 普通循环计数器 (`i` 等) | 属于无跨语句生命周期的局部循环变量 |

## 3. 跨文件依据与声明合并记录

1. **头文件声明与源文件实现合并**：
   - `course_board_init`, `course_led_set`, `course_led_toggle`, `course_uart_write`, `course_uart_read`, `course_log`, `course_busy_ms`, `course_keys_probe_init`, `course_keys_raw`, `course_key_ready`, `course_key_pressed`, `course_key_input_init`, `course_key_irq_init`, `course_key_isr`, `course_stats_init`, `course_stats_counter` 均在 `common/include/course_board.h` 中有前向声明。按照规范，主条目优先指向其实现位置 `common/platform/course_board.c`。
   - `course_fail`, `course_assert_fail` 在 `common/include/course_hooks.h` 中有前向声明，主条目指向实现位置 `common/platform/course_hooks.c`。
   - `system_clock_config` 在 `common/include/at32f435_437_clock.h` 中有声明，主条目指向实现位置 `common/platform/at32f435_437_clock.c`。
2. **跨文件配置支撑依据**：
   - `system_core_clock == 288000000U`：由 `at32f435_437_conf.h` 中的 `HEXT_VALUE (8MHz)`，经 `at32f435_437_clock.c` 中的 PLL 系数 `(8000000 * 72) / (1 * 2) = 288MHz` 计算支撑；由 `course_board_init` 中的断言检查。
   - `configLIBRARY_MAX_SYSCALL_INTERRUPT_PRIORITY == 5` 与 `COURSE_IRQ_PRIORITY == 6`：`course_rtos_config.h` 中定义系统调用阈值为 5，`course_board_config.h` 中自定义中断优先级配置为 6，因此中断优先级（数值 6 > 5）处于 FreeRTOS 管理范围之内，允许在按键 ISR 中安全调用 `FromISR` 系列 API。
   - `COURSE_LOG_STACK == 512U`：`course.h` 中定义带日志栈深度为 512 字（2048 字节），支撑 `course_board.c` 中 `course_log` 函数栈上分配 160 字节缓冲区及 `vsnprintf` 调用开销。

## 4. 校验命令与实际结果

使用仓库现有校验器 `validator/validate.py` 运行校验：

### 初稿校验
```powershell
python validator/validate.py --pack experiments/05-createtask-ai-direct-20261104-214840/pack-initial.json --src 'M:\005869\FreeRtos\projects\freertos-learning'
```
**输出结果**：
```
校验: experiments/05-createtask-ai-direct-20261104-214840/pack-initial.json; 错误 0 项，警告 6 项
[WARN] 词条 #10: 含有待确认说明，建议人工复核
[WARN] 词条 #11: 含有待确认说明，建议人工复核
[WARN] 词条 #12: 含有待确认说明，建议人工复核
[WARN] 词条 #81: 含有待确认说明，建议人工复核
[WARN] 词条 #119: 含有待确认说明，建议人工复核
[WARN] 词条 #120: 含有待确认说明，建议人工复核
[OK] 知识包通过校验
```

### 修订稿校验
```powershell
python validator/validate.py --pack experiments/05-createtask-ai-direct-20261104-214840/pack-revised.json --src 'M:\005869\FreeRtos\projects\freertos-learning'
```
**输出结果**：
```
校验: experiments/05-createtask-ai-direct-20261104-214840/pack-revised.json; 错误 0 项，警告 6 项
[WARN] 词条 #10: 含有待确认说明，建议人工复核
[WARN] 词条 #11: 含有待确认说明，建议人工复核
[WARN] 词条 #12: 含有待确认说明，建议人工复核
[WARN] 词条 #81: 含有待确认说明，建议人工复核
[WARN] 词条 #119: 含有待确认说明，建议人工复核
[WARN] 词条 #120: 含有待确认说明，建议人工复核
[OK] 知识包通过校验
```

### 警告说明
- 警告涉及词条：`COURSE_KEY_INDEX`, `COURSE_KEY_ACTIVE_LEVEL`, `COURSE_KEY_PULL`, `keys`, `vApplicationGetIdleTaskMemory`, `vApplicationGetTimerTaskMemory`。
- 警告原因：这些词条的 `uncertainty` 字段非空，如实记录了未经验证的硬件按键物理接线或条件编译依赖。现有校验器对此设计了正常提示（`[WARN]`），未产生任何格式错误（`0 errors`）。

## 5. 初稿冻结后与旧结果比对及源码复核

在 `pack-initial.json` 完成并冻结后，读取了旧知识包 `05_createtask-pack.json` 与复核文件 `05_createtask-review.json`。比对统计如下：

- **旧知识包词条数**：75 条
- **新初稿词条数**：120 条
- **新修订稿词条数**：122 条
- **两者共有符号**：73 个

### 实质差异与源码复核结论

| 差异分类 | 涉及符号 | 数量 | 旧方法处理 | 新直接阅读处理 | 源码复核结论与行动 |
| --- | --- | --- | --- | --- | --- |
| **旧包有、初稿没有** | `mask`, `timer_clock` | 2 | 收录为局部变量 | 初稿未单独列出局部变量 | **漏项**。`mask` 记录引脚掩码，`timer_clock` 计算 APB1 统计时钟。在 `pack-revised.json` 中补全收录。 |
| **新包有、旧包没有 (结构体成员)** | `reason`, `file`, `line`, `port`, `pin`, `source`, `line`, `irq` | 8 | 旧提取器未作为独立符号提取 | 按规范细化收录，scope 指明所属结构体 | **有效补充**。符合规范“结构体成员有独立解释价值时可作为 variable 收录，作用域标明所属类型”。保留。 |
| **新包有、旧包没有 (晶振参数)** | `HEXT_VALUE`, `HEXT_STARTUP_TIMEOUT`, `HICK_VALUE` | 3 | 旧 review 排除（认为是底层移植模板） | 直接阅读收录 | **有效补充**。`HEXT_VALUE` (8MHz) 直接决定时钟配置 288MHz 的数学计算，具有关键配置解释价值。保留。 |
| **新包有、旧包没有 (内核配置宏)** | `INCLUDE_*` (10项), `configUSE_*` (11项), `configPRIO_BITS`, `configKERNEL_INTERRUPT_PRIORITY` 等 | 31 | 旧 review 排除（视为通用模板配置） | 直接阅读收录 | **有效补充**。`course_rtos_config.h` 为课程全局内核裁决文件，直接阅读对这部分配置提供完整解释，加深对 RTOS 特性开关的理解。保留。 |
| **新包有、旧包没有 (静态系统内存回调)** | `vApplicationGetIdleTaskMemory`, `vApplicationGetTimerTaskMemory` | 2 | 旧 review 排除（因 05 默认为动态分配） | 直接阅读收录（标明条件编译） | **有效补充**。源码中明确存在，在 `uncertainty` 中准确说明条件编译分支触发条件。保留。 |
| **位置定义行差异** | `course_fault_type`, `key_pin_type` | 2 | 记录在 typedef 起始行 (L3, L6) | 初稿记录在类型名所在行 (L7, L12) | **格式微调**。修订稿将行号对齐为 typedef struct 首行。 |

## 6. 中文语义质量对比示例

直接阅读生成的中文与旧知识包对比如下（摘选典型条目）：

1. **`intervals`**：
   - **旧解释**：`数组元素 500 和 1000 分别作为 worker 的参数传入。`
   - **新解释**：`静态常量数组，保存两个动态 worker 任务各自的运行周期（毫秒）。元素 0 为 500ms（传给 dynamic_a 任务），元素 1 为 1000ms（传给 dynamic_b 任务）。由于任务生命周期与系统相同，参数对象必须具有静态生命周期，以保证任务在解引用传参指针时内存始终有效。`
   - **提升**：揭示了教学中“参数指针必须具有静态生命周期”的关键设计原则。

2. **`worker`**：
   - **旧解释**：`读取传入的毫秒周期，申请并释放一块 64 字节堆内存用于演示，然后循环记录计数并延时。`
   - **新解释**：`FreeRTOS 动态创建的任务入口函数。首先从 arg 获取周期配置并在堆上临时分配 64 字节内存，通过串口打印当前任务名、局部变量栈地址、入参地址、堆块地址以及剩余堆空间；随后立即释放临时堆块，进入死循环按周期打印运行次数和任务栈历史高水位（Stack High Water Mark，单位为 4 字节字），并阻塞延时。`
   - **提升**：明确了打印局部变量地址与参数地址的教学意图（验证各任务独立栈）、堆内存分配观察目的及高水位的具体单位（4 字节字）。

3. **`course_board_init`**：
   - **旧解释**：`配置系统时钟、优先级分组、LED、串口和 DWT 周期计数器，设置就绪标志并检查核心时钟为 288 MHz。没有防止重复调用的判断。`
   - **新解释**：`课程板级硬件一站式初始化函数。配置 288MHz 主频、更新 system_core_clock、配置 NVIC 为 4 位全抢占优先级分组；开启 GPIOC、GPIOB、USART1 外设时钟；配置 PC12/PC9 为推挽输出（默认关闭 LED）；配置 PB6/PB7 复用为 USART1 TX/RX 并使能 115200 波特率串口；开启 Cortex-M DWT 周期计数器用于微秒级延迟；最后置 board_ready=1 并校验 288MHz 主频及打印启动日志。`
   - **提升**：详尽说明各引脚（PC12/PC9、PB6/PB7）角色及推挽输出模式，以及 NVIC 全抢占优先级的配置细节。

## 7. 执行耗时与方法评估

- **AI 直接阅读阶段耗时**：约 15~20 分钟（完成 15 个文件的逐一读取、候选分析、中文编写及校验）。
- **相较旧流程的对比**：
  - 旧流程：需要依赖预先配置好编译工具链或运行复杂的 `extract.py` 脚本，经常遇到解析宏分支不准、漏掉条件编译代码、漏掉结构体成员等问题，且生成后仍需 AI 进行大量过滤（如 149 条中排除 74 条）。
  - AI 直接阅读新流程：无需运行外部符号提取脚本，AI 边读源码边理解工程上下文，不仅能准确识别主工程与共享板级支持代码，还能根据代码逻辑自发撰写高质量的上下文语义说明。
- **结论**：本样本试验表明，AI 直接阅读 C/H 源码不仅具备完全可行性，且能以较小的工作量生成依据更完整、质量更高的中文知识包。在试验基础上可进一步固化为通用 Skill。
