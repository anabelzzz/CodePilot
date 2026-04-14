# Issue Tracker — 统一问题跟踪

> 创建时间：2026-04-13
> 最后更新：2026-04-13
> 合并自：`open-issues-2026-03-12.md` + `v0.48-post-release-issues.md` + GitHub Issues 最新盘点

**AI 须知：**
- 发现新 bug 或用户报告时更新此文件，不要新建分散的跟踪文档
- 修复后标注状态、修复版本、关键 commit
- 定期检查 Sentry 和 GitHub Issues 是否有新增项
- 状态说明：🔴 未修复 | 🟡 部分修复 | 🟢 已修复 | ⚪ 需验证 | 🔵 设计如此

---

## 一、活跃 Bug（按优先级排序）

### P0 — 阻断核心功能

#### B-001 Provider 认证路径仍有边缘失败
- **Issues:** [#456](https://github.com/op7418/CodePilot/issues/456), [#461](https://github.com/op7418/CodePilot/issues/461), [#474](https://github.com/op7418/CodePilot/issues/474)
- **状态:** 🟡 部分修复（v0.48.2 修了主路径，边缘路径仍失败）
- **现象:** Provider 诊断 1-5 全 PASS，第 6 项"实际连通测试"报 `PROCESS_CRASH` 或 `No API credentials found`
- **已修复的部分（v0.48.1-v0.48.2）：**
  - `resolveProvider()` 改为尊重 `default_provider_id`，不再依赖 `is_active`
  - `hasAnyCredentials()` 检查全部 Provider
  - auto 模式增加凭据检查（无 Anthropic 凭据 → native runtime）
  - SDK 认证死循环 3 轮迭代修复（env → DB provider → env_only）
- **仍未覆盖的场景：**
  - 通过 cc-switch 配置本地 CLI 的用户（#461 评论 Theo-jobs）
  - v0.49.0 发布后仍有用户提交诊断 JSON（#474，2026-04-13）
  - 纯 CLI 用户没有设置任何 GUI Provider 的场景
- **Sentry 关联:** `No provider credentials available`（54x → 持续）
- **下一步:** 需要拿 #474 的诊断 JSON 分析具体失败路径；排查 cc-switch 用户的环境变量注入逻辑

#### B-002 Sentry: AI_NoOutputGeneratedError 持续增长
- **状态:** 🟡 部分修复（v0.48.1 修了 eventCount→hasContent 误报）
- **Sentry 数据:** 107x → 170x（2026-04-11）
- **已修复:** 空响应误报（agent-loop.ts eventCount→hasContent）
- **残留原因：**
  - sdkProxyOnly provider 被 native runtime 错误调用
  - 第三方代理模型 ID 不识别
  - 请求格式不匹配
- **下一步:** 在 Sentry 上报中加 provider/model 信息定位具体来源

---

### P1 — 功能受损

#### B-003 OpenAI OAuth 登录 403
- **Issues:** [#464](https://github.com/op7418/CodePilot/issues/464)
- **状态:** 🔴 未修复（有修复但用户仍复现）
- **现象:** `Token exchange failed: Token exchange failed: 403 - [object Object]`，macOS + Windows 均复现
- **已做的修复（commit `38fe566`）：** token expiry 检查、callback 成功确认、server 绑定 127.0.0.1
- **仍然存在的问题：**
  - 终端 `claude` 命令能正常 OAuth，CodePilot 不行 → 可能是 client ID / redirect URI 差异
  - `[object Object]` 说明错误序列化时没有 JSON.stringify
  - 可能和账号类型有关（Free vs Plus）
- **下一步:** 确认报错用户的账号类型；检查 token exchange 端点的 403 response body；修复 error 序列化

#### B-004 打包版 localStorage 随机端口导致设置丢失
- **Issues:** [#465](https://github.com/op7418/CodePilot/issues/465), [#466](https://github.com/op7418/CodePilot/issues/466) 评论
- **状态:** 🟡 部分修复（只迁移了 FeatureAnnouncementDialog）
- **现象：**
  - 模型选择器总是恢复为"自动（列表中第一个）"/ "Default (recommended)"（截图确认）
  - 每次重启显示"设置助理"提醒（promoDismissed 不持久）
  - 主题设置重启失效
- **根因（#466 评论 patgdut 明确指出）：** Electron 打包版每次启动用随机端口 → localStorage 按 origin 存储 → 重启清空
- **已修复:** FeatureAnnouncementDialog 改为 DB + localStorage 双写（commit `9395b7d`）
- **未迁移的组件：**
  - 默认模型选择（`codepilot:last-model` / `codepilot:last-provider-id`）
  - 主题设置（`theme` / `theme_family`）
  - promoDismissed（ChatListPanel）
  - 其他 `codepilot:*` localStorage 键
- **下一步:** 系统性排查所有 localStorage 依赖，迁移为 DB-first + localStorage 缓存

#### B-005 Generative UI 第三方 API 渲染失效
- **Issues:** [#471](https://github.com/op7418/CodePilot/issues/471)
- **状态:** 🔴 未修复
- **现象：**
  1. show-widget / Generative UI 在第三方 API 上只显示原始 JSON 文本块
  2. OpenRouter 官方预设 + 正确 API Key → Provider 诊断仍无法通过
- **v0.48.1 的 widget 修复（commit `a120066`）** 修的是 Unicode escape 问题，不涉及第三方 API 格式适配
- **可能原因：** Generative UI 解析逻辑可能硬编码了 Anthropic content block 格式；OpenRouter Native 协议适配可能在 v0.49.0 有回归
- **下一步:** 排查 show-widget 解析是否依赖特定 response 格式；测试 OpenRouter 连接路径

#### B-006 会话切换模型重置
- **Issues:** [#462](https://github.com/op7418/CodePilot/issues/462)
- **状态:** 🟡 可能和 B-004 相关
- **现象:** 第三方 API 用户每次切换会话，模型回到 Claude 默认模型，即使在设置中已设为默认
- **可能原因:** session 的 model 字段没正确持久化，或读取时 fallback 到已被清空的 localStorage
- **下一步:** 和 B-004 一起排查，确认 model 字段的读写链路

#### B-007 Turbopack 环境 CLI 启动失败
- **Issues:** [#470](https://github.com/op7418/CodePilot/issues/470)
- **状态:** ⚪ 有 workaround，非代码 bug
- **现象:** v0.48.2 用户报 `Claude Code CLI not found`，但终端 CLI 正常可用，能读到历史对话和 Skills
- **根因:** Next.js 16 Turbopack 处理 symlink/junction 的 bug（用户评论中找到）
- **Workaround:** 改用 `next dev --webpack` 代替 Turbopack
- **下一步:** 在 FAQ / 文档中说明；考虑默认关闭 Turbopack 或检测并提示

#### B-008 Sentry: Controller is already closed
- **状态:** 🔴 未修复（v0.48.0 前已存在）
- **Sentry 数据:** 28x → 30x
- **根因:** ReadableStream controller 在流结束后仍有写入（keep_alive timer 或 onStepFinish callback 延迟触发）
- **下一步:** 在 controller.enqueue 外加 try-catch 或检查 controller 状态

#### B-009 Sentry: Model not found: sonnet 短别名解析失败
- **状态:** 🔴 未修复
- **Sentry 数据:** 8x → 145x（大增，部分是用户配错模型名如 `gemma:e4b`）
- **根因:** native runtime 的 `createModel()` 短别名映射在某些路径被绕过；第三方代理不接受短别名
- **下一步:** 确保所有路径经过 `isShortAlias()` 映射；对用户输入的无效模型名给出明确错误提示

---

### P2 — 体验问题

#### B-010 Windows 发消息弹终端窗口
- **Issue:** [#244](https://github.com/op7418/CodePilot/issues/244)
- **状态:** 🔴 未修复
- **根因:** `child_process.spawn()` 缺少 `windowsHide: true`
- **修复方向:** `claude-client.ts` spawn 调用加 `windowsHide: true`

#### B-011 中文输入法回车误发送消息
- **Issue:** [#225](https://github.com/op7418/CodePilot/issues/225)
- **状态:** 🔴 未修复
- **根因:** `compositionend` 同步重置 `isComposing`，后续 `keydown(Enter)` 看到 false 触发提交
- **修复方向:** `handleCompositionEnd` 用 `setTimeout(0)` 延迟重置

#### B-012 多 Bridge 适配器同时启用互相干扰
- **Issue:** [#455](https://github.com/op7418/CodePilot/issues/455)
- **状态:** ⚪ 需重新诊断（2026-04-14 代码核实：隔离层面看不出问题）
- **代码核实:**
  - `FeishuChannelPlugin` 状态都是 instance 字段（`channels/feishu/index.ts:42-49`），无 globalThis 共享
  - `state.adapters` 是 per-type Map（`bridge-manager.ts:203`）
  - 每个 adapter 有独立 abort controller（`bridge-manager.ts:452`）
  - 错误追踪也是 per-adapter（`adapterMeta`）
- **下一步:** 需向用户收集具体复现步骤和日志——可能是飞书/QQ 单独的问题，或者是 `bridgeModeActive` 这类全局 flag 的交互

#### B-017 Feishu WSClient 长连接稳定性
- **Issues:** [#323](https://github.com/op7418/CodePilot/issues/323), [#288](https://github.com/op7418/CodePilot/issues/288), [#199](https://github.com/op7418/CodePilot/issues/199), [#149](https://github.com/op7418/CodePilot/issues/149), [#148](https://github.com/op7418/CodePilot/issues/148)
- **状态:** ⚪ 需重新诊断
- **现象:** Feishu WebSocket 长连接失败、断连、测试连接失败
- **已知错误码:** `code 1000040345 system busy`（飞书服务端）
- **下一步:** 收集 WSClient 错误日志和复现环境；考虑在 `gateway.ts` 的 `start()` 外层加重连+健康检查
- **关联:** `@larksuiteoapi/node-sdk` v1.59.0 的 WSClient 不提供 clean stop（`gateway.ts:180-186` 注释）

#### B-013 连接测试误报失败
- **状态:** 🟡 部分修复（v0.48.2 修了 masked key 回填）
- **残留:** 测试和实际聊天走的 provider resolution 路径不同

#### B-014 Claude Code 批量导入需逐个手点
- **Issue:** [#465](https://github.com/op7418/CodePilot/issues/465) 附带反馈
- **状态:** 🔴 未修复
- **描述:** 导入 Claude Code 会话需要一个个手动选择，无批量选择

---

### P3 — 低优先级

#### B-015 Bridge 斜杠命令不识别
- **Issues:** [#231](https://github.com/op7418/CodePilot/issues/231), [#229](https://github.com/op7418/CodePilot/issues/229)
- **状态:** 🔴 未修复
- **根因:** Bridge 走 SDK `query()`，斜杠命令不被 CLI 处理

#### B-016 Windows 卸载卡住
- **Issue:** [#454](https://github.com/op7418/CodePilot/issues/454)
- **状态:** 🔴 未修复（NSIS 已知问题，非代码 bug）

---

## 二、已修复（归档）

| ID | 问题 | 修复版本 | 关键 commit/文件 |
|----|------|----------|-----------------|
| ~~B-F01~~ | #456 主路径认证死循环 | v0.48.1-v0.48.2 | sdk-runtime.ts 3 轮迭代 |
| ~~B-F02~~ | AI_NoOutputGeneratedError 误报 | v0.48.1 | agent-loop.ts eventCount→hasContent |
| ~~B-F03~~ | 看板 Widget 样式丢失 | v0.48.1 | widget-sanitizer.ts overflow:hidden |
| ~~B-F04~~ | SqliteError FOREIGN KEY | v0.48.1 | db.ts 事务清理 outbound_refs |
| ~~B-F05~~ | Codex API 超时 | v0.48.1 | ai-provider.ts 30s 超时+代理提示 |
| ~~B-F06~~ | #449 Provider test masked key | v0.48.2 | 回填真实 key |
| ~~B-F07~~ | #447 default_provider_id 不生效 | v0.48.2 | resolveProvider 改造 |
| ~~B-F08~~ | #341 CLI 检测失败 | v0.38.4 | findClaudeBinary() |
| ~~B-F09~~ | #343/#346 切换 Provider 崩溃 | v0.38.4 | PATCH 自动清 stale sdk_session_id |
| ~~B-F10~~ | #347 默认模型回退 | v0.38.4 | global default model |
| ~~B-F11~~ | FeatureAnnouncement 重启后重现 | v0.49.0 | DB + localStorage 双写 |
| ~~B-F12~~ | OpenAI OAuth 基础流程 | v0.48.2 | commit 38fe566 |

---

## 三、Feature Requests（按活跃度排序）

| Issue | 描述 | 状态 | 备注 |
|-------|------|------|------|
| [#469](https://github.com/op7418/CodePilot/issues/469) | 一键导入 + 浏览 Claude Code 对话历史 | 🟡 部分满足 | v0.49.0 `codepilot_session_search` 解决了搜索，可视化浏览未做 |
| [#473](https://github.com/op7418/CodePilot/issues/473) | 语音交互 STT/TTS | 📋 待评估 | |
| [#460](https://github.com/op7418/CodePilot/issues/460) | 定时任务 | 📋 待评估 | |
| [#459](https://github.com/op7418/CodePilot/issues/459) | 左侧 UI 采用 Codex 文案风格 | 📋 待评估 | |
| [#458](https://github.com/op7418/CodePilot/issues/458) | 多 OpenAI OAuth 账号 | 📋 待评估 | |
| [#463](https://github.com/op7418/CodePilot/issues/463) | 代码界面可编辑 + 语法高亮 | 🔵 设计如此 | Claude Code 理念：AI 写 100% 代码 |
| [#246](https://github.com/op7418/CodePilot/issues/246) | 应用内自动更新 | 📋 待实现 | 已有 electron-updater 依赖 |
| [#254](https://github.com/op7418/CodePilot/issues/254) | 会话列表待确认状态指示 | 📋 待实现 | |
| [#236](https://github.com/op7418/CodePilot/issues/236) | @ 自动补全文件路径 | 📋 待实现 | |
| [#242](https://github.com/op7418/CodePilot/issues/242) | 多 bot 桥接 | 📋 待实现 | 高复杂度 |
| [#234](https://github.com/op7418/CodePilot/issues/234) | Codex / 多 CLI 后端支持 | 📋 长期规划 | |

---

## 四、Sentry 监控摘要（截至 2026-04-11）

| 错误 | 数量 | 趋势 | 关联 Bug | 状态 |
|------|------|------|----------|------|
| Claude Code process exited with code 1 | 6640x | 既有 | — | 既有问题，量最大 |
| AI_NoOutputGeneratedError | 170x | ↑ | B-002 | 🟡 部分修复 |
| HTTP 404 model not found | 145x | ↑↑ | B-009 | 🔴 |
| No provider credentials | 54x | ↑ | B-001 | 🟡 |
| SqliteError FOREIGN KEY | 40x | 🆕 | — | 🟢 已修复 |
| Controller already closed | 30x | → | B-008 | 🔴 |
| AI_RetryError: chatgpt.com timeout | 15x | 🆕 | — | 🟢 已修复 |
| fetch failed | 11x | 🆕 | — | 网络层 |
| ClaudeCodeCompat 503/500/400 | 9x | ↑ | — | 第三方代理 |
| AI_MissingToolResultsError | 5x | → | — | 🔴 |
| HMAC apikey not found | 4x | → | — | 特定 Provider |

---

## 五、流程管理备注

- [#466](https://github.com/op7418/CodePilot/issues/466) 用户建议增加内测版流程，在内部群测试通过后再发布正式版
- 多位用户反馈"来回升级回退太麻烦"，说明发版质量需提升
- 建议：每次发版前至少用 Provider 诊断工具跑一轮第三方 API 场景的端到端测试
