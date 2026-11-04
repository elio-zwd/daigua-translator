#include <stdint.h>

static uint32_t motor_start_count;
static uint32_t reload_probe_count;
static uint32_t retained_probe_count;

/** @brief 启动电机演示
 * @param speed 目标速度
 * @return 本次目标速度
 */
int Motor_Start(int speed)
{
    uint32_t requested_speed = speed;
    motor_start_count++;
    reload_probe_count++;
    retained_probe_count++;
    return requested_speed;
}
