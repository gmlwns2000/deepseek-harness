---
kind: upgrade-guide
description: "内置搜索默认值从 DeepSeek Search API 改为匿名 DuckDuckGo，DeepSeek 网页提供方被禁用。"
---

# 搜索默认使用 DuckDuckGo；DeepSeek 网页提供方被禁用

[English](guide.md) | 中文

## 变更

此前，共享 base 组合将 `web.searchProvider` 设为 `deepseek-search-api`，并挂载 DeepSeek 网页提供方：`web-search-deepseek` 条目提供的 `deepseek-official`，以及 `web-deepseek-api` 条目提供的 `deepseek-search-api` 和 `deepseek-fetch-api`。搜索使用会话的 DeepSeek 凭据发往 DeepSeek Search API。现在 base 挂载 `@deepseek-ai/dsh-web-search-duckduckgo`，设置 `searchProvider: duckduckgo`，并禁用 `web-search-deepseek` 与 `web-deepseek-api` 条目。每次搜索都是本机向 DuckDuckGo HTML 结果页发出的一次表单 POST，无需 API 密钥或计费；没有任何网页请求经过 DeepSeek 服务。抓取仍默认使用 `http`。

选择了 `deepseek-search-api`、`deepseek-official` 或 `deepseek-fetch-api` 的 profile 补丁或设置文档现在指向未注册的提供方，因此 `web_search` 或 `web_fetch` 会以 `WEB_PROVIDER_CONFIGURED_MISSING` 失败。自行挂载网页条目的组合不受影响。

## 迁移

1. 若使用新的默认值，请从 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 的 `web` 条目中删除指向 DeepSeek 提供方的 `searchProvider` 或 `fetchProvider`，或在「网页搜索与获取」设置页选择 DuckDuckGo 与本机获取。确认：网页搜索提供方下拉框显示 DuckDuckGo，且搜索能返回来源。
2. 若要保留某个 DeepSeek 网页提供方，请在 profile 补丁中重新启用其条目并选中它：

   ```yaml
   - id: web-deepseek-api
     disabled: false
   - id: web-search-deepseek
     disabled: false
   - id: web
     config:
       searchProvider: deepseek-search-api
       fetchProvider: http
   ```

   确认：`dsh --profile <profile> --dump-config` 显示这两个条目都没有 `disabled: true`，且网页搜索提供方下拉框列出 DeepSeek 提供方。
