# Unia-Danmu

B站直播间弹幕机器人。连接直播间 WebSocket，监听事件并自动发送弹幕回复，支持礼物答谢、进房欢迎、感谢分享、关键字自动回复、定时广播等功能。

账号登录支持 **Unia-BiliCookie 服务**（优先）和**扫码登录**（独立本地存储），互相独立、无缝切换。

## 功能

- **礼物答谢**：金瓜子礼物达到阈值后自动感谢，支持合并同一用户的多次礼物、按牌子/航海过滤
- **进房欢迎**：观众进入直播间时自动欢迎，支持按牌子/航海等级过滤
- **感谢分享**：观众分享直播间时自动感谢
- **自动回复**：关键字触发（精确/包含/正则），支持安全词排除和每条规则独立冷却
- **定时广播**：按固定间隔循环发送消息，支持顺序和随机两种模式
- **发送限速队列**：所有弹幕经过队列发送，间隔 3.5 秒，防止账号因频繁发送受限
- **自动重连**：WebSocket 断线后指数退避重连，最长 60 秒一次
- **配置热更新**：通过 API 修改配置后无需重启，定时任务立即生效

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
PORT=3200
# 可选：Unia-BiliCookie 服务地址，留空则仅使用本地扫码登录
COOKIE_MANAGER_URL=http://localhost:3100
```

### 启动服务

```bash
npm start
# 或开发模式（文件变更自动重启）
npm run dev
```

服务启动后监听 `http://localhost:3200`，按控制台输出的 API 列表操作。

## 账号登录

### 方式一：Unia-BiliCookie（推荐）

在 `.env` 中配置 `COOKIE_MANAGER_URL`，服务启动时自动从 BiliCookie 服务获取账号 Cookie，无需手动操作。BiliCookie 服务不可用时自动回退到本地登录。

### 方式二：扫码登录

```bash
# 1. 获取二维码（返回 base64 图片和 key）
GET /api/auth/qrcode

# 2. 前端展示二维码，用 B站 APP 扫码后轮询状态
GET /api/auth/poll?key=<qrcode_key>

# 登录成功后 Cookie 自动保存到 data/cookies.json（30天有效）
```

## 启动 Bot

```bash
# 启动，指定房间号（也可在 data/config.json 中预先配置）
POST /api/bot/start
Body: { "roomId": 12345678 }

# 停止
POST /api/bot/stop

# 查看状态
GET /api/bot/status
```

## API 接口

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/qrcode` | 生成登录二维码 |
| GET | `/api/auth/poll?key=` | 轮询扫码状态 |
| GET | `/api/auth/status` | 查看当前登录状态 |
| POST | `/api/auth/logout` | 退出登录（清除本地 Cookie）|

### Bot 控制

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/bot/start` | 启动 Bot（body: `{roomId}`）|
| POST | `/api/bot/stop` | 停止 Bot |
| GET | `/api/bot/status` | Bot 状态（`idle/connecting/running/error`）|
| POST | `/api/bot/send` | 手动发送一条弹幕（body: `{message}`）|

### 配置管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取完整配置 |
| PUT | `/api/config` | 覆盖更新完整配置 |
| PUT | `/api/config/gift` | 更新礼物答谢配置 |
| PUT | `/api/config/enter` | 更新进房欢迎配置 |
| PUT | `/api/config/share` | 更新感谢分享配置 |
| PUT | `/api/config/autoReply` | 更新自动回复配置 |
| PUT | `/api/config/timing` | 更新定时广播配置 |

## 配置说明

配置存储在 `data/config.json`，详细格式参见 `data/config.example.json`。

### 礼物答谢

```json
{
  "gift": {
    "enabled": true,
    "minPrice": 1000,
    "type": 0,
    "mergeWindow": 10000,
    "messages": ["感谢 @name@ 送来的 @giftName@！"]
  }
}
```

| 字段 | 说明 |
|------|------|
| `minPrice` | 触发感谢的最低价格（单位：电池，1元=1000电池）|
| `type` | `0` 全部 / `1` 仅本播间牌子 / `2` 仅航海 |
| `mergeWindow` | 合并窗口（毫秒），窗口内同一用户的礼物合并后统一感谢 |
| `messages` | 话术列表，随机选一条发送 |

模板变量：`@name@`（用户名）、`@giftName@`（礼物名/合并后汇总）、`@price@`（价值，元）

### 进房欢迎 / 感谢分享

```json
{
  "enter": {
    "enabled": true,
    "type": 0,
    "messages": ["欢迎 @name@ 进入直播间~", "@name@ 来了，快坐！"]
  }
}
```

模板变量：`@name@`（用户名）、`@guard@`（航海称号，如「舰长」）

### 自动回复

```json
{
  "autoReply": {
    "enabled": true,
    "rules": [
      {
        "enabled": true,
        "keywords": ["签到"],
        "match": "exact",
        "safewords": [],
        "messages": ["@name@ 签到成功！"],
        "type": 0,
        "cooldown": 0
      }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `keywords` | 触发关键字列表（OR 关系，命中任意一个即触发）|
| `match` | `exact`（精确）/ `contains`（包含）/ `regex`（正则）|
| `safewords` | 安全词，命中后跳过此规则（优先级高于 keywords）|
| `cooldown` | 单条规则冷却秒数，0 表示无限制 |

模板变量：`@name@`（用户名）、`@msg@`（原始弹幕内容）

### 定时广播

```json
{
  "timing": {
    "enabled": true,
    "interval": 300,
    "order": "sequence",
    "messages": ["欢迎来到直播间～", "喜欢的话点个关注！"]
  }
}
```

| 字段 | 说明 |
|------|------|
| `interval` | 发送间隔（秒），最小 60 |
| `order` | `sequence`（顺序循环）/ `random`（随机）|

## 项目结构

```
src/
├── index.js              启动入口
├── app.js                Express 路由注册
├── bot.js                主 Bot 类（状态机 + 事件协调）
├── services/
│   ├── bilibiliLiveWS.js  WebSocket 客户端（WBI 签名/Brotli 解压/重连）
│   ├── bilibiliAuth.js    扫码登录（二维码生成/状态轮询）
│   ├── cookieManager.js   Cookie 管理（BiliCookie 服务优先）
│   └── danmuSender.js     弹幕发送队列（限速 3.5s）
├── handlers/
│   ├── giftHandler.js     礼物答谢
│   ├── enterHandler.js    进房欢迎
│   ├── shareHandler.js    感谢分享
│   ├── autoReplyHandler.js 自动回复
│   └── timingHandler.js   定时广播
├── routes/
│   ├── auth.js            认证 API
│   ├── config.js          配置 API
│   └── bot.js             Bot 控制 API
└── utils/
    ├── template.js        模板替换（@key@ 语法）
    └── storage.js         JSON 配置读写
data/
├── config.json            运行时配置（自动生成）
├── config.example.json    配置示例
└── cookies.json           本地登录 Cookie（自动生成，不入库）
```

## 与其他 Unia 服务集成

本项目是 [Unia-Websites](https://github.com/Polaris-Leo/Unia-Websites) 项目群的一部分：

- **[Unia-BiliCookie](https://github.com/Polaris-Leo/Unia-BiliCookie)**：账号 Cookie 集中管理，配置 `COOKIE_MANAGER_URL` 后自动联动
- **[Unia-Admin](https://github.com/Polaris-Leo/Unia-Admin)**：管理端（Bot + APP），未来可对接本服务的配置 API
- **[Unia-Danmuku](https://github.com/Polaris-Leo/Unia-Danmuku)**：弹幕监控展示工具（不发弹幕，仅展示）
