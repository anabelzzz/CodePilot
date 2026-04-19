## CodePilot v0.51.0

> 支持 Claude Opus 4.7（1M 上下文 + xhigh 推理），升级 Agent SDK 至 0.2.111 并落地新能力；输入框加入结构化 @ 文件/文件夹引用和拖拽识别；新增全局搜索（会话 / 消息 / 文件三类）。

### 新增功能

- **Claude Opus 4.7** 作为默认 Opus 模型 — 首方 Anthropic 下默认 1M 上下文，新增 xhigh 推理档位。启用 extended thinking 时会自动切到 adaptive+summarized，让思考过程在 UI 上可见
- **@ 文件 / 文件夹 结构化引用** — 输入框敲 `@` 唤起选择器（视觉上与 `/` 命令、CLI 工具、模型选择器统一），可选择文件或文件夹；选中后以 chip 展示，发送时作为结构化元数据一起送出，LLM 能直接读取被引用的目录内容摘要
- **文件夹拖拽识别** — 从 Finder 拖文件夹到输入框，现在会被正确识别为 `@directory` mention 并插入 chip；之前会变成一个 0 字节的空附件
- **全局搜索对话框** — 侧栏搜索按钮唤起，默认同时搜会话 / 消息 / 文件；支持 `session:` / `message:` / `file:` 前缀缩小范围；点击消息结果直达对应会话位置，点击文件结果直达文件
- **对话结束原因 Chip** — 当一轮对话因 prompt_too_long / blocking_limit / max_turns 等特殊原因结束时，末尾显示状态 chip，并附可操作按钮（压缩后重试、启用 1M 上下文、切换到 Sonnet、打开 hook 设置等 8 个动作，按终止原因匹配）
- **订阅配额 Banner** — 使用 claude.ai 订阅时遇到配额预警或拒绝，聊天页顶部显示倒计时 banner，按会话可关闭
- **上下文指示器精确化** — 指示器现在用 SDK 返回的真实 usage 字段（input_tokens + cache_read + cache_creation），不再走 char-based 估算；tooltip 上新增数据来源标记

### 修复问题

- 新聊天首轮的思考片段、结束原因 chip、订阅 banner 在页面从 `/chat` 跳到 `/chat/[id]` 后正确保留显示，之前首轮这些状态会被吃掉
- 使用 `/compact` 或压缩失败后不小心在关闭窗口外重试的问题 — 现在 compress_and_retry 窗口会被后续的 /compact 或 compress_only 动作明确关闭
- 空 base_url 的遗留 Anthropic 第三方 provider（GLM、Kimi、MiniMax 等）不会再因为协议校验错误被误判；第三方 Anthropic 代理选择推理强度时会弹出提示说明该参数在该运行时会被忽略
- Bedrock / Vertex provider 的 base_url 缺省不会再被 provider-doctor 报错
- @ 选择器的文件夹和文件图标统一为中性配色（之前是主题蓝，与其他 popover 不一致）；Files 头换成和技能选择器一致的分组标签
- 新聊天中当工作目录在 `/tmp`、外部盘或挂载盘时，@ 选择器不会再被错误拒绝（之前只认 $HOME 下的路径）

### 优化改进

- **全局搜索性能** — 在历史会话较多（30+）的本地库上，默认 all-mode 每次键入不再扫描所有会话的工作目录，改为按 resolved 路径去重后只扫最近 5 个唯一 workspace；`file:` / `files:` 前缀放宽到 15 个。跨 10+ 项目找文件时需要显式用 `file:` 前缀才能覆盖更广
- **Claude Agent SDK 升级** 至 0.2.111（从 0.2.62 跨越 49 个版本），带来 TerminalReason、RateLimitEvent、精确 context usage 等新能力；AI SDK Anthropic 同步升级到 3.0.70
- Turbopack 构建期 NFT 警告从 16 条降到 1 条（通过 outputFileTracingExcludes + 静态 JSON import + 移除 db 层动态 require）；剩余 1 条是 instrumentation 和 /api/files/suggest 共享 chunk 的已知限制，不影响实际运行

### 已知限制

- `@文件` / `@文件夹` 暂不识别含空格的路径（如 `docs/Product Spec.md`），picker 插入和拖拽都会在第一个空格处截断；含空格的目录/文件只能作为普通文本提到，chip 不显示、不发送结构化元数据。下个小版本单独修
- E2E 自动化覆盖本版收窄到核心路径（≈44 条通过 / ≈112 条 skipped）；layout / plugins / settings / skills 等 describe 块在新 UI 下 selectors 已全面失效，已明确 `test.describe.skip` 待重写。单元测试 1084 条、smoke 6 条全绿，核心主路径覆盖仍在，但上述区域的视觉/布局回归短期内靠手动 / CDP 抽查
- 全局搜索 all-mode 只覆盖最近 5 个唯一 workspace，跨更多项目找文件需要显式使用 `file:` 前缀；未来计划引入文件索引替代每次递归扫盘

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.51.0/CodePilot-0.51.0-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.51.0/CodePilot-0.51.0-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.51.0/CodePilot.Setup.0.51.0.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter / OpenAI 等）
- 推荐安装 Claude Code CLI 以获得完整功能
