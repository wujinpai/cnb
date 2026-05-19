# CNB 图床 Pro

一个简洁、安全的轻量级图床应用，支持密码验证、拖拽上传、相册管理和图片预览。

## 功能特性

- 🔐 密码验证 - 安全访问控制
- 📤 拖拽上传 - 支持拖拽或点击上传
- 📊 上传进度 - 实时显示上传进度
- 🖼️ 相册管理 - 图片网格展示，支持搜索
- 🔍 图片预览 - 全屏预览，支持键盘导航
- 📋 链接复制 - 一键复制图片链接
- 🗑️ 图片管理 - 支持删除图片
- 🌙 主题切换 - 支持明暗主题

## 技术栈

- **前端**: Vue 3 + TypeScript + Vite + TailwindCSS
- **后端**: Express.js (Node Functions)
- **存储**: CNB 对象存储

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- pnpm >= 10.0.0

### 安装

```bash
pnpm install
```

### 开发

```bash
pnpm dev
```

### 构建

```bash
pnpm build
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `UPLOAD_PASSWORD` | 上传密码 |
| `SLUG_IMG` | CNB 仓库路径 |
| `TOKEN_IMG` | CNB 访问令牌 |
| `VITE_BASE_IMG_URL` | 图片 CDN 域名 |

## 部署

部署到腾讯云 EdgeOne Pages：

1. `src/` → Pages 静态站点
2. `node-functions/api/` → Node Functions
3. `edge-functions/img-api/` → Edge Functions

## 许可证

MIT
