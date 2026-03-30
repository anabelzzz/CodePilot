## CodePilot v0.43.1

> v0.43.0 热修复：修复可视化组件流式输出时中文显示为乱码、看板刷新按钮对 CLI 数据源不生效的问题。

### 修复问题

- 修复可视化组件在流式输出时中文字符显示为 `\uXXXX` 转义码的问题
- 修复看板刷新按钮对 CLI 数据源类型的组件不生效的问题

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.43.1/CodePilot-0.43.1-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.43.1/CodePilot-0.43.1-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.43.1/CodePilot-Setup-0.43.1.exe)

## 安装说明

**macOS**: 下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击"仍要打开"
**Windows**: 下载 exe 安装包 → 双击安装

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.31+)
- 需要配置 API 服务商（Anthropic / OpenRouter 等）
- 推荐安装 Claude Code CLI 以获得完整功能
