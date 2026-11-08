---
kind: upgrade-guide
description: "除非启动环境设置 DSH_TELEMETRY_ENABLED，已启动的 profile 会禁用所有会话与使用数据上传。"
---

# 会话与使用数据上传默认关闭，需启动时选择开启

[English](guide.md) | 中文

## 变更

此前，已启动的 profile 会在显式反馈时上传完整会话日志（`session-telemetry-otel`，`FEEDBACK_ONLY`），在官方 DeepSeek 请求中附带会话日志后缀与插件包清单（`session-log-deepseek`、`plugin-package-inventory-deepseek`），并发送桌面端产品埋点（`product-analytics`、`desktop-product-telemetry`）；只有 `DSH_TELEMETRY_DISABLED` 能关闭反馈上传。现在启动器会在所有 profile、home 与 overlay 补丁之后，把这些条目以及切换会话日志上传的设置条目（`ui-settings-session-log`）都打上禁用补丁。只有当启动环境把 `DSH_TELEMETRY_ENABLED` 设为非空值且 `DSH_TELEMETRY_DISABLED` 为空时，这些条目才会保持挂载。反馈仍记录在会话日志中，但不再上传。所有通过 `dsh` 启动的产品都会受到影响，包括 Web 与桌面端。

## 迁移

1. 若要保留原有上传，请在启动 `dsh` 或桌面端的环境中设置 `DSH_TELEMETRY_ENABLED=1`；`.env` 文件不能设置它。确认：`dsh --profile <profile> --dump-config` 显示 `session-telemetry-otel` 没有 `disabled: true`，且**设置 → 通用**中重新出现会话日志上传开关。
2. 若要保持上传关闭，无需任何操作；在 profile 补丁中对这些条目设置 `disabled: false` 不再能开启它们。确认：`--dump-config` 的输出末尾包含针对 profile 中现有上传条目的 `disabled: true` 补丁。
