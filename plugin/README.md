# 呆瓜翻译器 MTranCode 插件

通过 `contributes.translates` / `extendTranslate` 注册 `daigua` 翻译源，优先匹配本地 MCU 知识包，未命中时使用 `bing-translate-api` 回退。

- 设置 `daiguaTranslate.packPaths`（JSON 文件路径列表）。
- 命令面板运行 `呆瓜翻译器：重新加载知识包`。
- 插件在重新加载后会更新活动翻译器读取的快照。
- **MTranCode 在调用自定义翻译器之前有持久化缓存**；重复查询先前已经命中过的相同文本可能显示旧结果。

开发验证：

```bash
npm ci
npm test
```

详细限制和手工联调步骤：[MTranCode 集成验收说明](../docs/mtrancode-integration.md)。
