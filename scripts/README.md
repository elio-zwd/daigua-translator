# 测试工具与验证方法

本目录是项目的 CLI 验证入口。通过脚本、VS Code 扩展宿主 API 和 Chromium 调试接口完成检查，不操作真实鼠标或键盘。

## 目录分工

| 目录 | 用途 |
| --- | --- |
| `scripts/` | 编排验证、启动隔离宿主、检查界面和安装包 |
| `plugin/test/` | 插件逻辑、查询、配置与交互回归测试 |
| `plugin/host-tests/` | 在真实 VS Code 中执行宿主和界面测试 |
| `tests/` | Python 工具测试及跨语言共享测试数据 |
| `docs/` | 产品说明、操作指南与历史验证记录 |

## 环境与运行位置

目标环境为 Windows 10 x64，使用 PowerShell 7、Node.js 22+、Python 3.10+。真实宿主与界面检查还需要本机 VS Code。

以下命令均在仓库根目录执行。首次开发需先安装插件依赖；运行宿主或界面脚本前，必须先编译当前源码，避免检查到旧的 `plugin/out`。

```powershell
# 首次开发时安装依赖
npm.cmd --prefix plugin install

# 单独编译；npm test 和完整验证脚本也会自动编译
npm.cmd --prefix plugin run compile
```

## 按改动选择检查

| 检查 | 命令 | 适用场景 |
| --- | --- | --- |
| 插件测试 | `npm.cmd --prefix plugin test` | TypeScript 查询、匹配、配置与交互逻辑 |
| Python 测试 | `python -m unittest discover -s tests -p test_*.py` | 词库校验、提取和音标工具 |
| 完整基础验证 | `pwsh.exe -NoProfile -File scripts/verify.ps1` | 插件、Python、知识包及离线冒烟回归 |
| 真实宿主检查 | `pwsh.exe -NoProfile -File scripts/test-vscode.ps1` | 激活、悬停、命令、配置及多个悬停提供者共存 |
| 安装包宿主检查 | `pwsh.exe -NoProfile -File scripts/test-vscode.ps1 -VsixPath plugin/daigua-translator.vsix` | 将 VSIX 安装到隔离扩展目录，检查实际安装后的配置注册、保存和查询 |
| 界面检查 | `node scripts/test-ui.cjs` | 查词面板、设置页、样式与真实页面交互 |
| 打包 | `npm.cmd --prefix plugin run package` | 交付 VSIX；包含插件测试和离线冒烟检查 |
| 安装包检查 | `python scripts/check-vsix.py plugin/daigua-translator.vsix` | 检查运行模块、资源、配置及打包排除规则 |

完整基础验证默认不发送 Bing 翻译请求。需要验证联网翻译时，可显式运行 `pwsh.exe -NoProfile -File scripts/verify.ps1 -Online`，该检查发送一个普通英文句子。

交付涉及界面的版本时，按以下顺序运行；任一步失败，先处理失败，不把后续成功视为前一步已通过：

```powershell
# 基础回归，同时编译当前源码
pwsh.exe -NoProfile -File scripts/verify.ps1

# 检查真实 VS Code 的功能与界面
pwsh.exe -NoProfile -File scripts/test-vscode.ps1
node scripts/test-ui.cjs

# 打包当前版本，检查生成的安装包
npm.cmd --prefix plugin run package
python scripts/check-vsix.py plugin/daigua-translator.vsix
pwsh.exe -NoProfile -File scripts/test-vscode.ps1 -VsixPath plugin/daigua-translator.vsix
```

仅修改文档时，核对内容和本地链接，并运行 `git diff --check`；不需要启动 VS Code 或重跑完整测试。

## 界面如何验证

宿主及界面脚本会启动独立的 VS Code 测试窗口，使用临时用户配置、扩展目录和测试工作区，完成后自动关闭。测试窗口可能显示在桌面上，但脚本不注入鼠标或键盘输入，也不使用日常工作区的配置。

- 宿主测试通过 VS Code API 调用命令、查询悬停并核对结果。
- 宿主测试逐项检查安装清单中的配置是否已注册、默认值是否一致。`-VsixPath` 模式将产品作为普通扩展安装，使用单独的临时测试驱动；不以产品开发模式代替安装验证。
- 界面测试通过 Chromium 调试接口读取真实 Webview DOM、触发页面事件并获取截图。
- 界面脚本检查深色、浅色、高对比度主题，窄面板与长名称换行，锁定与跟随行为，以及设置保存和调试来源展示。
- 截图用于检查排版效果，自动断言用于验证行为；只有截图文件不能证明所有功能通过。

## 报告与失败排查

| 检查 | 结果位置与成功依据 |
| --- | --- |
| 插件、Python 与基础验证 | 终端测试汇总、退出码；完整基础验证末尾输出 `Automated verification passed` |
| 真实宿主检查 | `%TEMP%\daigua-host-*\report.json`；脚本打印具体路径，报告的 `passed` 为 `true` |
| 界面检查 | `%TEMP%\daigua-ui-*\report.json` 及 PNG 截图；终端打印目录和检查项，`passed` 为 `true` |
| 安装包检查 | 终端输出版本、检查结果、大小和 SHA-256 |

界面截图包括 `reader-dark.png`、`reader-light.png`、`reader-contrast.png`、`reader-narrow.png`、`settings.png` 和 `settings-debug.png`。失败时某些截图可能尚未生成；界面测试目录中另有 `host.log` 可供排查。

通用技术库添加检查使用 `knowledge-packs/dfu-20261110/general-terms.json`，在隔离宿主中替代文件选择返回值，通过真实 Webview 按钮验证 17 条词条的添加提示、重复选择、无效文件、取消和移除。输出 `settings-library-added.png` 与 `settings-library-error.png`；不操作原生文件窗口。真实宿主检查另行验证该文件的离线悬停查询。

若 VS Code 不在默认命令路径中，可以指定其位置：

```powershell
pwsh.exe -NoProfile -File scripts/test-vscode.ps1 -CodePath 'C:\实际安装目录\Microsoft VS Code\bin\code.cmd'

$env:DAIGUA_CODE_EXE = 'C:\实际安装目录\Microsoft VS Code\Code.exe'
node scripts/test-ui.cjs
Remove-Item Env:DAIGUA_CODE_EXE
```

失败时保留具体错误和证据目录。根据失败的检查项修复后，重跑相关检查；如脚本暂时无法覆盖某个问题，明确记录限制，不默认改为控制电脑鼠标或键盘。

## 更新后提示配置未注册

若添加文件时提示“没有注册配置 daiguaTranslate.technicalLibraryPaths，因此无法写入工作区设置”，表示当前 VS Code 会话未注册该配置项。先核对安装包声明，并运行上面的安装包宿主检查；JSON 词库校验通过不能证明配置可以保存。

本次 0.5.2 的实际安装验证中，全部配置注册、路径保存和 DFU 离线查询均通过。用户保存文件并关闭所有 VS Code 窗口、重新打开工程后，确认添加成功。遇到同类会话状态问题时，应完整重启 VS Code；仅重启扩展宿主可能不足以恢复配置注册。
