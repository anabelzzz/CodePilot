## CodePilot v0.45.1

> 新增默认侧边面板设置、小米 MiMo Token Plan 渠道，以及 Buddy 头像本地化等修复。

### 新增功能

- 新增「默认侧边面板」设置：可选择新对话时自动打开文件树、看板、Git 或不打开
- 新增小米 MiMo Token Plan 服务商预设，支持订阅套餐方式使用

### 修复问题

- 修复 Buddy 头像在部分网络环境下无法加载的问题（图片改为本地打包）
- 修复 Windows 安装包下载链接指向错误文件名的问题

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.45.1/CodePilot-0.45.1-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.45.1/CodePilot-0.45.1-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.45.1/CodePilot.Setup.0.45.1.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter 等）
- 推荐安装 Claude Code CLI 以获得完整功能
