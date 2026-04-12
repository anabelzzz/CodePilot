## CodePilot v0.49.0

> Agent Runtime 能力大升级 — 借鉴 Hermes Agent 框架的 6 项核心能力 + 12 项额外改进。Native Runtime 用户将获得更智能的工具调度、更低的 API 成本、跨会话记忆、以及全新的交互式提问和 Skill 建议功能。

### 新增功能

- **历史会话搜索**：Agent 现在可以搜索所有历史对话的内容。当你说"上次我们讨论 X 的结论是什么"时，它能自动检索并引用之前的对话，不再需要手动翻找和复制
- **Skill 自动保存建议**：当 Agent 完成一个复杂多步工作流（8+ 步骤、3+ 种工具）后，会在对话区底部弹出持久提示条，建议你把这个流程保存为可复用的 Skill。点击"保存为 Skill"按钮可一键启动保存流程
- **结构化提问（AskUserQuestion）**：Agent 现在可以向你提出结构化的多选题，而不只是文字提问。当需要你在多个方案之间做选择时，会弹出带选项按钮的交互卡片，所有问题必须回答完整才能提交
- **辅助模型自动路由**：上下文压缩、摘要等辅助任务现在会自动使用你配置中的小模型（如 Haiku），不再消耗主模型的额度。支持 5 级智能降级，即使主服务商不可用也能自动切换到备用服务商
- **上下文压缩通知**：长对话触发自动压缩时，状态栏会显示"已压缩 N 条消息，节省约 X tokens"的提示，持续 5 秒，让你知道发生了什么

### 优化改进

- 辅助模型路由现在正确识别当前会话的服务商，不再错误使用全局默认服务商的凭证进行压缩
- Bridge/IM 场景下 AskUserQuestion 会被明确拒绝并提示模型改用文字提问，而不是静默返回空答案
- 权限系统新增"总是需要交互"工具类别，AskUserQuestion 和 ExitPlanMode 即使在信任模式下也会弹出 UI
- permission-registry 的超时计时器添加了 unref()，不再阻止应用优雅退出
- 上下文压缩器 shouldAutoCompact 标记为 @deprecated，指向真正在用的 needsCompression

### 基础设施（开发者相关）

- 并行安全调度模块（parallel-safety.ts）：4 层判定算法已就绪，等待 AI SDK 提供 batch 级 hook 后接入
- 渐进式子目录发现模块（subdirectory-hint-tracker.ts）：AGENTS.md/CLAUDE.md 懒加载已就绪，等待 agent-tools.ts 集成
- Token 预算裁剪模块（pruneOldToolResultsByBudget）：可选的增强裁剪策略已就绪
- 新增 ~90 个单元测试，覆盖所有新模块

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.49.0/CodePilot-0.49.0-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.49.0/CodePilot-0.49.0-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.49.0/CodePilot.Setup.0.49.0.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter / OpenAI 等）
- 可选安装 Claude Code CLI 以获得完整命令行能力
