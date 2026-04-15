## CodePilot v0.50.2

> 稳定性与凭据隔离专项修复版。重点修复 cc-switch 用户切换 provider 后被默默改路由、OpenAI OAuth 在部分网络环境下 403、Turbopack 生产路径报 "streamClaudeSdk is not a function"、内置 Memory/Widget 等 MCP 不该弹权限还弹的问题，以及 v0.49.0 后新增的长对话 AI_MissingToolResultsError 回归。强烈建议所有 cc-switch / 第三方 API / OpenAI OAuth 用户升级。

### 修复问题

- **cc-switch 切换 provider 后请求被默默改路由**（#461/#478/#476/#457/#470/#474）：显式选择 Kimi/GLM/OpenRouter 等第三方 provider 时，`~/.claude/settings.json` 里 cc-switch 写入的 `ANTHROPIC_*` 环境变量不再覆盖你选的 provider 凭据；env group（无显式 provider）则继续完整尊重 cc-switch 配置。每个请求建临时 shadow HOME 做隔离，不影响任何原有文件
- **OpenAI OAuth 登录 "Token exchange failed: 403 - [object Object]"**（#464）：macOS/Windows 用户在边缘节点 propagation 延迟时登录失败。现加 3 次指数退避重试（1s/2s/4s），对 403、408、429、5xx、网络级失败（ECONNRESET/ETIMEDOUT/ECONNREFUSED/ENOTFOUND）自动重试；错误消息不再出现 `[object Object]`
- **升级后 localStorage 配置全丢（主题 / 默认模型 / 工作目录记忆）**（#465/#466/#477）：Electron 每次启动 renderer origin 变化导致 localStorage 整体作废。改用 47823-47830 稳定端口范围，并修复"探测后释放再绑定"的 TOCTOU race（两实例同时启动不再相互踢掉）
- **v0.49.0+ 长对话卡死 "AI_MissingToolResultsError"**：v0.49.0 Hermes 升级把上下文窗口的近期轮次数从 16 降到 6，导致工具密集对话中 `tool_use` 块还在窗口内、配对的 `tool_result` 被截断，Vercel AI SDK 抛错卡死。恢复为 16 轮，截断标记改为 `[Pruned <toolName> result: ...]` 让模型仍能配对
- **第三方 provider 发消息报 "streamClaudeSdk is not a function"**：Next.js 16 + Turbopack 的 CJS↔ESM interop 问题，影响 chat 主路径。把 5 处内部 lazy `require()` 改为静态 ES import 修复
- **内置 Memory / Widget / Notify 等 MCP 被反复弹权限确认**：cc-switch 桥接工作上线后被误触发。7 个 CodePilot 内置 MCP 现通过 `allowedTools` 自动批准（用户自装的 MCP 仍按原权限模式走）
- **Windows 报 "Claude Code executable not found"**：247 events/14d 的 Sentry 顶部错误。SDK cli.js 之前没被复制到 standalone bundle，现加入 `serverExternalPackages` 让 SDK 随 `extraResources` 完整保留
- **切换会话后计时器归零**（#480/#484）：`ElapsedTimer` 之前 mount 时用 `Date.now()` 当起点，session 切换 remount 归零。改为从 stream-session-manager 透传起点时间，remount 后基于真实起点恢复
- **选 slash 命令清空已输入文本**（#479/#486）：弹窗选命令时触发位前后的用户已输入内容会被清掉。现在保留文本，光标定位到末尾
- **Skills 弹窗误触发 / 不能多选 / badge 占地方**：输入框里带单斜杠路径（`src/app`、`foo/bar`、`~/bin`）不再误触发弹窗；点击斜杠按钮时如前面是非空白字符会自动补空格，`hello` → `hello /` 正常弹出 Skills 选择器；支持同时选多个 Skills（按 command 去重），发送时合并为一条 prompt；badge 显示只保留命令名，去掉占地方的描述文字
- **findClaudeBinary 首次启动误报**：WSL2 / 跨境 VPN 用户 timeout 3s 改 5s；两遍策略先找存在路径再做 `--version` 校验，校验超时但文件存在仍返回该路径
- **OpenAI OAuth 误重试浪费时间**：token exchange 的真实 auth 错误（400/401/404/422）不再参与重试

### 优化改进

- Sentry 服务端 `ignoreErrors` 补齐 `prompt() is not supported`（Electron 未实现）和 `ResizeObserver loop` 两条规则，与 client 端同步（368 events/14d 噪声清理）
- 内置 MCP 启动失败错误提示更清晰

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.50.2/CodePilot-0.50.2-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.50.2/CodePilot-0.50.2-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.50.2/CodePilot.Setup.0.50.2.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter / OpenAI 等）
- 推荐安装 Claude Code CLI 以获得完整功能
