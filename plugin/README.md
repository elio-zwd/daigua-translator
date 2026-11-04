# 呆瓜翻译器 MTranCode 插件

优先查本地 MCU 包，未命中时由本插件调用 `bing-translate-api`。采用与 MTranCode 相同的调用方式和语言映射，不依赖宿主内部实例，不增加 AI 或账号配置。

设置 `daiguaTranslate.packPaths` 为 JSON 绝对路径数组，从 MTranCode 选择“呆瓜翻译器（本地知识包）”。匹配区分大小写并支持尾部空括号；同名候选全部显示，普通长文本完整回退。

“呆瓜翻译器：重新加载知识包”及路径配置变更会刷新活动实例。坏包整体拒绝，重载失败保留该路径旧包，移除路径立即移除。提示区分成功包数、保留旧包数和有效词条数，详情见同名输出通道。

宿主持久化缓存可能先于插件返回旧译文；重载不等于清除缓存，切换源或重启也不保证清除。本插件不修改宿主或其缓存数据库。

开发需要 PowerShell 7、Node.js 22+：

```powershell
npm ci
npm test
# 先验证测试与离线示例，再打包到 daigua-translator.vsix
npm run package
```

[手工验收与记录](https://github.com/elio-zwd/daigua-translator/blob/main/docs/mtrancode-integration.md)。当前候选版本待用户手动验收，不发布 Marketplace。
