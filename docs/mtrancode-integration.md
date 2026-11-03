# MTranCode 集成与验收说明

## 本阶段代码修改

- 自定义翻译源 ID 为 `daigua`，由 `extendTranslate` 注册，翻译器每次查询读取共享的知识包快照。
- 重新加载命令和知识包路径变更均刷新快照；异步加载顺序有保护。
- Bing 回退使用 `bing-translate-api`。这是 MTranCode 内置 Bing 采用的同一个库，**并非调用 MTranCode 的内部翻译实例**；宿主没有公开该实例。
- Bing 请求失败和返回无效译文时抛出异常，交由宿主统一处理，避免把错误字符串写入正常译文缓存。

## 已确认的宿主缓存限制

MTranCode 的 `TranslateManager.translate()` 在执行自定义翻译器之前，先从其 `workspaceState` 读取以翻译源、语言对、原文为键的翻译缓存。自定义翻译服务的注册接口只提供翻译器构造函数，**没有清除宿主缓存的 API**。

所以，本仓库可以保证已经运行的翻译器读取新知识包，但**不能保证宿主已经缓存过的相同字符串在重新加载后立即显示新解释**。彻底解决需要 MTranCode 提供按翻译源清理缓存或把知识包版本加入缓存键。切换翻译源或重新加载 VS Code 窗口都不等于清除持久化缓存。

## 自动测试

在 `plugin/` 执行：

```bash
npm ci
npm test
```

自动测试验证本地精确匹配、歧义、Bing 回退内容与错误传递，以及使用模拟 VS Code API 的真实扩展注册与重新加载。Bing 调用在测试中被模拟；这**不能代替真实 MTranCode 宿主或联网测试**。

## VS Code 手工验收步骤

1. 安装 MTranCode，编译呆瓜翻译器并在 Extension Development Host 中加载（或者打包并安装 VSIX）。
2. 设置 `daiguaTranslate.packPaths` 为真实存在的知识包 JSON 绝对路径。
3. 从 MTranCode 的 Change translation source 选 `呆瓜翻译器（本地知识包）`。
4. 查询示例 `worker()`，应出现函数中文说明、声明与来源；断网使用尚未查询过的本地词条仍应命中。
5. 联网查询未收录英文内容，验证 Bing 回退；断网查询未收录内容，应失败而不是显示假的“成功译文”。
6. 修改知识包，运行 `呆瓜翻译器：重新加载知识包`，用**此前未查询过的唯一符号**验证新词条；对已查询过的符号记录宿主缓存表现。
7. 更换 `daiguaTranslate.packPaths` 路径，确认新知识包自动生效。

## VSIX 打包说明

插件运行需要 `bing-translate-api` 生产依赖，不能将 `node_modules/` 整体排除在 VSIX 外。GitHub Actions 使用 vsce 打包并检查 VSIX 中的扩展入口与 Bing 生产依赖，成功后生成可下载的构建产物。仍需安装到真正的 VS Code + MTranCode 宿主进行交互验收。

## 尚未由自动测试证明

- MTranCode 宿主缓存失效（需要上游改造）
- 真正 VS Code / MTranCode 的 UI 联调
- VSIX 打包、安装和联网/断网实测
