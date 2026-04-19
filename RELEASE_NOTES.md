## CodePilot v0.50.3

> Agent 引擎选择简化 + 入口引导收敛。此版本把 0.50.2 后冒出的 FileTree 崩溃、OpenAI OAuth 用户被错误拦截、阿里云百炼缺 Qwen 3.6 Plus 等问题一次性清掉；同时落地了之前积累已久的改动：Agent 引擎去掉"自动"选项、发消息时没配置服务商直接引导去设置中心。cc-switch 纯用户升级后首次发消息会被引导去添加 CodePilot 服务商，这是本版的**主要行为变化**，见下方说明。

### 新增功能

- **阿里云百炼增加 Qwen 3.6 Plus 模型**（#483）：替换原有 Qwen 3.5 Plus。已经在会话里显式选过旧模型名的用户，下次发消息时模型选择器会自动回到默认，手动重选即可
- **没配置服务商时自动打开引导**：首次安装或没在 CodePilot 里添加过任何服务商的用户，发消息时不会再出一条莫名其妙的"No provider credentials"错误，而是直接弹出 SetupCenter 的服务商卡片引导添加

### 改进体验

- **Agent 引擎选择从三项变两项**：设置页的"Agent 内核"下拉只剩 **Claude Code** 和 **AI SDK** 两项，删掉了原先含义模糊的"自动"选项。原先选"自动"的用户，首次打开设置页时会按当前环境自动迁移到具体值（装了 Claude Code CLI → Claude Code，没装 → AI SDK），持久化写回，之后不再变动
- **聊天页引擎标识同步**：右侧聊天页的引擎 badge 不再出现"Agent: Auto"，读到 legacy 'auto' 值会立即按同一规则折算显示具体引擎
- **错误提示统一引导到"设置 → 服务商"**：Claude Code CLI 的 "Not logged in · Please run /login" 和 CodePilot 自己的"No provider credentials available"两种错误，现在统一归类为"未配置服务商"，文案一致、都带"打开设置"按钮，不再让用户看到 `/login` 这种在 CodePilot 里走不通的引导
- **OpenAI OAuth 登录 / 登出同步 SetupCenter**：之前 OAuth 登录成功、设置面板的 Provider 卡片不会实时翻绿；登出后也不会回灰。现在两条路径都立即更新

### 修复问题

- **打开聊天页时 FileTree 崩溃**（0.50.2 回归）：Next.js 16 + Turbopack 生产构建在某种编译模式下会对解构默认参数里的 `new Set()` 报 `ReferenceError: defaultExpanded is not defined`。将默认值提到模块顶层常量
- **OpenAI OAuth 用户发消息被 412 拦截**：本版新加的"入口拦截"最初漏识别 OpenAI OAuth 这个虚拟服务商，导致用 OAuth 登录的用户一律被错误引导去配服务商。现补上 OAuth 存在性判定
- **Bedrock / Vertex 供应商被误判为"未配置"**：新 UI 把路由 flag 存到 `env_overrides_json`，旧代码只读 `extra_env`。改成和 resolver 一样的 `env_overrides_json || extra_env` 优先级 + JSON 解析
- **SetupCenter 对只装了 Claude Code CLI 的用户显示"服务商已配置"**：这些用户被新的入口拦截挡住，但 SetupCenter 还告诉他们"provider 已完成"，陷入无可操作的死循环。现在两边判定口径对齐
- **OAuth 登出后 Provider 卡片不降级**：之前只能升 completed 不能降 not-configured，登出后 SetupCenter 继续显示绿色假态
- **legacy 'auto' 迁移可能把装了 CLI 的用户错写成 AI SDK**：迁移逻辑之前依赖异步 hook 状态，首次加载时 hook 还是 null 会被误判为 "CLI 未装"。改为迁移分支内直接查一次 `/api/claude-status`，状态查询失败时不持久化，保留旧值待下次重试

### 重要行为变化（cc-switch 用户必读）

从 0.50.3 起，CodePilot 的"有没有可用服务商"判定**不再**把 `~/.claude/settings.json`（cc-switch / 手动编辑）视作有效服务商。如果你之前纯靠 cc-switch 管理 Claude Code 凭据、**从未在 CodePilot 设置里添加过任何服务商**，升级后首次发消息会被引导去"设置 → 服务商"添加一个 CodePilot 自己的服务商记录。

这是为了让 CodePilot 的每个请求都能精确地知道该走哪个服务商的凭据，避免之前 cc-switch 代理模式下占位符 token 被错当成真凭据而导致的各种诡异失败。你仍可以继续用 cc-switch 管理 Claude Code CLI 本身的凭据——两者是独立的。

## 已知限制

下列项在本版是明确登记的限制或技术债务，不影响主功能，但发版 gate 里需要看清楚：

- **`@file` / `@directory` mention 不识别含空格的路径**。picker 插入和拖拽目录都会失败——`parseMentionRefs` 用空格分词，`docs/Product Spec.md` 只会读成 `docs/Product`，chip 消失、结构化 mention 不发送。tech-debt #8，下个小 PR 单独修（同步改 token 转义 + parser + Backspace）
- **E2E gate 覆盖收窄**。`npm run test:e2e` 仍然绿，但 layout / plugins / settings / skills / project-panel / visual-regression 等 describe 块被明确 `test.describe.skip` 掉（~110 个测试）。这些 spec 都在测已被重写的旧版 UI（sr-only "Toggle sidebar"、"Plugins & Skills" 落地页、pre-PanelZone 右侧面板、旧 settings tab 结构），在新 UI 下不再可用。单元测试 1084 条、smoke 6 条全绿，能用的集成覆盖仍在；但 **layout / plugins / settings 的回归目前只能靠手动或 CDP 抽查**，不能指望 E2E 挡住。tech-debt #9，下一轮按当前 UI 重写
- **`npm run build` 剩一条 Turbopack NFT warning**。构建通过，指向 `instrumentation.js` 与 `/api/files/suggest` route chunk 共享的情况。已经把 `outputFileTracingExcludes` + 静态 JSON import 把 16 条降到 1 条；这最后一条要等 Turbopack 侧修好或者 instrumentation 完全独立于用户路径扫描才能清掉。不影响 Electron 打包（NFT 清单在桌面端不消费）

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.50.3/CodePilot-0.50.3-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.50.3/CodePilot-0.50.3-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.50.3/CodePilot.Setup.0.50.3.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter / OpenAI 等）
- 推荐安装 Claude Code CLI 以获得完整功能
