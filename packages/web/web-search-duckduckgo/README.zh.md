---
description: "ctx.web 的匿名 DuckDuckGo 搜索后端：部署方如何在无需 API Key、不经 DeepSeek 服务的情况下从本机直接搜索公网。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-duckduckgo

[English](README.md) | 中文

## 概述

有了 `dsh-web-search-duckduckgo`，harness 可以通过 web 服务（`ctx.web`）把查询提交到 DuckDuckGo 的无脚本 HTML 结果页，并返回标题、链接与摘要。当部署需要无需 API Key、账号、计费，且请求路径中不含任何 DeepSeek 服务的搜索时，请选择它；共享基础组合将它选为默认搜索提供方。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已加载 web 服务的组合中挂载本提供方；它以 `duckduckgo` 搜索提供方身份注册，因此当它是唯一可用的搜索后端时，`ctx.web.search()` 会自动解析到它——也可以用 `searchProvider: duckduckgo` 固定选择。

### 何时选择

当搜索只允许离开本机前往 DuckDuckGo 时选择此后端：每次搜索都是本进程发出的一次 HTTPS 表单 POST，只携带查询、地区代码与明确的产品 `User-Agent`，不带 Cookie 或凭据。

### 最小配置

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: duckduckgo
    fetchProvider: http
- id: web-search-duckduckgo
  name: '@deepseek-ai/dsh-web-search-duckduckgo'
  config:
    region: wt-wt          # optional; DuckDuckGo kl code, wt-wt = no region
    timeoutMs: 20000       # optional; per-search timeout
    maxResponseBytes: 2000000 # optional; larger responses fail
```

`endpoint`（默认 `https://html.duckduckgo.com/html/`）与 `userAgent` 同样可配置。端点不是 HTTP(S)、地区不是两段式 `kl` 代码、限制值非正或超出范围，或 `User-Agent` 为空时，加载会失败。

### 搜索返回什么

按页面顺序返回自然结果，每条包含目标 URL，并在 DuckDuckGo 显示时附带标题与摘要文本。广告、非 HTTP(S) 链接与重复 URL 会被丢弃，`duckduckgo.com/l/?uddg=` 重定向链接会还原为目标地址。提供方返回页面上的全部结果；`ctx.web` 按请求的 `maxResults` 截断。不生成回答 `content`。

### 失败与恢复

所有失败都是 `WebError`。非 200 状态、重定向、超大响应体、端点不可达，以及 DuckDuckGo 的自动流量验证（202 响应或没有结果的验证页面）都以 `WEB_PROVIDER_ERROR` 失败；验证页面的消息会提示稍后重试。提供方自身超时以 `WEB_SEARCH_TIMEOUT` 失败，调用方取消以 `WEB_ABORTED` 失败。没有结果的结果页返回空来源列表。

<a id="understand-the-implementation"></a>
## 理解实现

提供方不保存状态：它只持有解析后的选项与全局 `fetch`，后者在配置了代理时使用启动器的代理分发器。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口、`Config` 默认值与加载时校验、提供方注册 |
| [`src/provider.ts`](src/provider.ts) | 每次搜索一次有界表单 POST、状态与响应体检查、错误分类 |
| [`src/parse.ts`](src/parse.ts) | 基于 `parse5` 提取自然结果并识别验证页面 |

<a id="further-exploration"></a>
## 进一步探索

- [`dsh-web`](../web/README.zh.md)——`searchProvider` 所依据的提供方注册表与选择规则。
- [`dsh-tool-web`](../tool-web/README.zh.md)——`web_search` 如何为模型渲染这些来源。
- [`dsh-web-fetch-http`](../web-fetch-http/README.zh.md)——基础组合与本搜索提供方搭配的匿名抓取后端。

<a id="model-experience"></a>
## 模型体验

间接通过 `dsh-tool-web` 呈现：它在搜索结果包装中渲染每个来源的标题、URL 与摘要；端点、地区与传输限制对模型不可见。

#### KV Cache 影响

无直接失效；所述消费方负责任何请求前缀变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明了本提供方何时不适用。它们是当前包的约束。

- **HTML 页面不是稳定 API**——DuckDuckGo 可能修改页面结构；此时结果无法解析，搜索在解析器适配新结构之前不返回来源。
- **自动流量可能被拒绝**——同一地址的突发搜索可能收到 DuckDuckGo 的验证页面，在 DuckDuckGo 解除限流之前搜索会失败。
- **每次搜索只读一页**——提供方只读取第一页结果（约十条），除地区代码外不提供时间、站点或安全搜索过滤。
- **摘要较短**——来源只包含 DuckDuckGo 的展示摘要；模型需用 `web_fetch` 抓取页面以获得全文。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文——点击展开</summary>

无。

</details>
