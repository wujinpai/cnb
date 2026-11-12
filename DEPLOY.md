# 图床部署指南（EdgeOne Pages）

## 1. 准备工作

### 1.1 CNB 仓库与 Token
1. 在 [cnb.cool](https://cnb.cool) 新建一个**公开或私有**仓库（仅作附件存储用，建议单独建一个，例如 `你的用户名/imgbed-store`）。
2. 创建访问令牌，权限需要：
   - `repo-notes:rw`（上传）
   - `repo-code:r`（下载/代理）
   - `repo-manage:rw`（删除、资产列表）
3. 记下 `仓库名（用户名/仓库名）` 和 `Token`。

### 1.2 己素 SSO（登录用）
1. 登录己素 SSO 管理后台 → 接入方，新增接入方「己素图床」，回调地址填：
   ```
   https://img.example.com/api/auth/callback
   ```
   （须与图床域名一致；SSO 只放行白名单里的回调地址）
2. 记下返回的 `client_id` 与 `client_secret`（secret 只显示一次），填到下面第 2 节的环境变量里。

### 1.3 EdgeOne KV
1. EdgeOne 控制台 → 存储 → KV，开通。
2. 创建命名空间，例如 `imgbed-records`。
3. 绑定到 Pages 项目，**变量名必须为 `IMG_RECORDS_KV`**，重新部署。

## 2. 环境变量

在 EdgeOne Pages 项目设置 → 环境变量中添加：

| 变量 | 必填 | 说明 |
|---|---|---|
| `BASE_IMG_URL` | 是 | 图床对外域名，**以 `/` 结尾**，如 `https://img.example.com/` |
| `CNB_REPO` | 是 | CNB 仓库 `用户名/仓库名` |
| `CNB_TOKEN` | 是 | CNB 访问令牌 |
| `SSO_URL` | 是 | 己素 SSO 地址，如 `https://sso.jisu.cn`（无尾斜杠也可） |
| `SSO_CLIENT_ID` | 是 | 己素 SSO 接入方 client_id |
| `SSO_CLIENT_SECRET` | 是 | 己素 SSO 接入方 client_secret（只在创建时显示一次） |
| `AUTH_SECRET` | 是 | 本站 token HMAC 密钥，随机长字符串（修改即全端下线） |
| `MAX_UPLOAD_MB` | 否 | 图片单文件上限，默认 10，最大 100 |
| `MAX_VIDEO_MB` | 否 | 视频单文件上限，默认 50，最大 500（注意 CNB 平台自身限制） |
| `UPLOAD_RATE_LIMIT` | 否 | 上传限流 次/分钟/IP，默认 60 |

## 3. 部署

### 方式一：一键部署（推荐）
[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new)

1. 填入本仓库地址，EdgeOne 自动识别 `edgeone.json`（构建 `npm run build` → `dist`，函数目录 `node-functions`）。
2. 按第 2 节填好环境变量，绑定 KV 命名空间（变量名 `IMG_RECORDS_KV`）。
3. 部署，绑定自定义域名（需与 `BASE_IMG_URL` 一致）。

### 方式二：Git 推送自动部署
1. 将代码推到 GitHub/GitLab 仓库。
2. EdgeOne Pages → 从代码仓库导入，选择该仓库。
3. 同上配置环境变量与 KV 绑定。

## 4. 验证

1. 打开 `https://img.example.com/login`，应看到「用己素 SSO 登录」按钮。
2. 点击 → 跳转己素 SSO 登录（QQ/GitHub）→ 授权后跳回图床首页（右上角显示昵称）。
3. 拖一张图片到首页上传区 → 压缩上传 → 结果卡出现 → 点「直链」复制，在新窗口打开应能显示图片。
4. 管理页应能看到刚才的图片；点分享按钮复制 `/s/xxx` 链接，隐身窗口打开应能看到分享页。
5. 传一个 MP4（< MAX_VIDEO_MB），管理页应显示视频封面，点开可播放、拖进度。

## 5. 常见问题

- **登录按钮显示"未配置登录"**：`SSO_URL` / `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` 未设置或部署未生效；检查环境变量后重新部署。
- **己素 SSO 跳转后提示"回调地址不对"**：去己素 SSO 管理后台 → 接入方，确认图床的回调地址 `https://img.example.com/api/auth/callback` 已在白名单里。
- **上传失败 "CNB 401"**：Token 无效或被撤销，重新创建。
- **上传失败 "CNB 403"**：Token 缺权限，对照 1.1 节补齐。
- **列表为空但 CNB 有文件**：管理页 URL 加 `?rebuild=1` 刷新一次可重建索引（需登录）。
- **视频无法拖进度**：代理已透传 Range；若仍不行，检查浏览器是否缓存了旧响应。

## 6. 数据说明

- 图片/视频**源文件**存在 CNB 仓库附件中；**记录索引**（文件名、直链、大小、时间）在 EdgeOne KV。
- 删除默认进回收站（30 天），到期自动彻底删除并联动删除 CNB 源文件。
- 分享链接 token 存在 KV，删除原记录时联动失效。
