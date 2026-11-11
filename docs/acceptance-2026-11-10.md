# 0.5.1 设置页提示词验证（2026-11-10）

## 交付行为

中文设置页“词库管理”增加“让外部 AI 完善词库”，可展开全文并点击“复制完整提示词”。成功或失败信息在按钮旁显示。复制内容包含任务模板、项目包与通用库格式、校验和加载说明；发送前填写工程信息，并提供代码和已有词库。

`docs/external-ai-handoff.md` 为维护入口，编译时同步到插件资源。VSIX 内容检查核对资源与维护文档的字节一致，避免提示词两处维护。资源缺失时禁用复制并显示说明，原有查词继续可用。

## 实际检查结果

- `pwsh.exe -NoProfile -File scripts/verify.ps1`：退出码 0；Python 33 项、插件 86 项测试通过，知识包校验与离线冒烟通过。原始包和增强样本各保留 18 项已有不确定性警告，不阻止使用。
- 编译后执行 `pwsh.exe -NoProfile -File scripts/test-vscode.ps1`：退出码 0，VS Code 1.107.1，`passed: true`。报告保存在 `C:\Users\005869\AppData\Local\Temp\daigua-host-90736958e83c4c9e85fee900a09405b6\report.json`。
- `node scripts/test-ui.cjs`：最终退出码 0，`passed: true`。通过真实 Webview 按钮验证复制成功提示和剪贴板全文，核对展开预览全文；浅色、深色、高对比度和窄面板无横向溢出。证据保存在 `C:\Users\005869\AppData\Local\Temp\daigua-ui-XRAjO5\`，包含报告和设置页截图。
- `npm.cmd --prefix plugin run package`：退出码 0，生成 `plugin/daigua-translator.vsix`，版本 0.5.1。打包仍提示仓库未提供 LICENSE 文件。
- `python -X utf8 scripts/check-vsix.py plugin/daigua-translator.vsix`：退出码 0，运行模块、提示词资源全文与打包排除规则通过。大小 799032 字节，SHA-256：`5dc7d5503b3b922298a2e2ef32b23be1cad869e8af2ebf67ad30faeb37601cc5`。

检查使用临时配置和隔离工作区，无真实鼠标或键盘注入。未安装到用户日常 VS Code；未调用外部 AI，也未验证外部模型的实际制包质量。
