# Unia-Danmu — 开发者说明

## 项目概述

B站直播间弹幕机器人，Node.js 18+ / ES Modules。通过 WebSocket 连接 B站直播服务器，监听弹幕/礼物/进房等事件，按规则自动发送弹幕回复。提供 REST API 供前端或外部服务控制。

**项目在 Unia-Websites 中的位置：** `projects/Unia-Danmu`（子模块）

---

## 技术栈

- **运行时**：Node.js 18+，ES Modules（`"type": "module"`），无 TypeScript
- **HTTP**：Express 4
- **WebSocket 客户端**：`ws` 库（连接 B站直播服务器）
- **解压**：`pako`（zlib/deflate）+ Node.js 内置 `zlib.brotliDecompressSync`（brotli）
- **配置存储**：本地 JSON 文件（`data/config.json`）
- **无数据库**，无 Redis，无构建步骤

---

## 文件结构与职责

```
src/
├── index.js              入口：加载 dotenv，预加载 Cookie，启动 Express
├── app.js                注册全部路由，不含业务逻辑
├── bot.js                DanmuBot 类 —— 核心状态机，见下文
│
├── services/
│   ├── bilibiliLiveWS.js  BilibiliLiveWS 类：管理 WebSocket 生命周期
│   ├── bilibiliAuth.js    扫码登录：generateQRCode / pollQRCode / fetchBuvid
│   ├── cookieManager.js   Cookie 优先链：BiliCookie服务 → 本地文件
│   └── danmuSender.js     DanmuSender：发送队列，硬编码 3500ms 间隔
│
├── handlers/              事件处理器，全部通过 getConfig() 实时读取配置
│   ├── giftHandler.js     礼物答谢（含合并窗口逻辑）
│   ├── enterHandler.js    进房欢迎
│   ├── shareHandler.js    感谢分享
│   ├── autoReplyHandler.js 关键字自动回复
│   └── timingHandler.js   定时广播（setInterval）
│
├── routes/
│   ├── auth.js            扫码登录 API，登录成功后调用 bot.setCookies()
│   ├── config.js          GET/PUT 配置，支持分模块更新
│   └── bot.js             start / stop / status / send
│
└── utils/
    ├── template.js        applyTemplate(text, vars) — @key@ 替换；pickRandom(arr)
    └── storage.js         loadConfig / saveConfig / updateConfig（深合并）

data/
├── config.json            运行时配置（由 storage.js 读写，默认值见 DEFAULT_CONFIG）
├── config.example.json    示例配置，不被程序读取
└── cookies.json           本地 Cookie（不入库，由 .gitignore 排除）
```

---

## 核心类：DanmuBot（src/bot.js）

整个应用的中枢，持有所有运行时对象的引用。

```
DanmuBot
  ._config       当前配置（内存副本，来自 data/config.json）
  ._cookies      当前账号 Cookie 对象（键值对）
  ._selfUid      Bot 自身的 B站 UID（用于防止回复自己）
  ._ws           BilibiliLiveWS 实例
  ._sender       DanmuSender 实例
  ._handlers     { gift, enter, share, autoReply, timing }
  .status        'idle' | 'connecting' | 'running' | 'error'
```

**启动流程（`bot.start(roomId)`）：**
1. 写入 roomId → `data/config.json`
2. 若无 Cookie，调用 `loadCookies()`（BiliCookie 服务 → 本地文件）
3. new DanmuSender，new BilibiliLiveWS
4. 调用 `_initHandlers()` 绑定事件回调
5. 调用 `ws.connect()`

**`_initHandlers()` 的时机问题：**
此方法在 `ws.connect()` 前调用，但 `anchorId`（主播 UID）此时可能为 null（需等 `getRealRoomId()` 完成）。Handler 内部对 `anchorId` 的使用是在事件触发时（连接建立后），因此实际不影响。若将来需要在 Handler 中提前用到 anchorId，应改为在 `onConnect` 回调中初始化 Handler。

---

## WebSocket 协议（src/services/bilibiliLiveWS.js）

B站直播 WebSocket 数据包格式（二进制帧）：

```
[0-3]  uint32BE  总包长（含16字节包头）
[4-5]  uint16BE  包头长度（固定16）
[6-7]  uint16BE  协议版本
       1 = 普通 JSON
       2 = zlib 压缩（可含多个子包）
       3 = brotli 压缩（可含多个子包）
[8-11] uint32BE  操作码 op
       2 = 客户端心跳
       3 = 服务端心跳回复（含人气值）
       5 = 服务端推送消息（JSON）
       7 = 客户端认证
       8 = 服务端认证回复
[12-15] uint32BE sequence（固定1）
```

**连接建立流程：**
1. `getRealRoomId()` — 短号转真实号，同时获取 `anchorId`
2. `initBuvid()` — 访问 bilibili.com 首页获取 buvid3（认证包必需）
3. `getDanmuInfo()` — 带 WBI 签名请求弹幕服务器列表和 token
4. 建立 WSS 连接，`onopen` 发送认证包（op=7，protover=3/brotli）
5. 每 30 秒发一次心跳包（op=2，空 body）

**关键事件（`_handleCommand` 中处理）：**

| cmd | 事件 | 触发回调 |
|-----|------|---------|
| `DANMU_MSG` | 弹幕 | `onDanmaku` |
| `SEND_GIFT` | 礼物 | `onGift` |
| `GUARD_BUY` / `USER_TOAST_MSG` | 上舰 | `onGuard` |
| `INTERACT_WORD` msg_type=1/2 | 进房/关注 | `onEnter` |
| `INTERACT_WORD` msg_type=3 | 分享 | `onShare` |
| `LIVE` / `PREPARING` | 直播状态 | `onLiveStatus` |

**重连策略：** 初始 5 秒，每次失败 ×1.5，上限 60 秒。主动调用 `disconnect()` 设置 `_intentionalDisconnect = true` 阻止重连。

---

## Cookie 优先链（src/services/cookieManager.js）

```
loadCookies()
  → 若 COOKIE_MANAGER_URL 非空：
      GET {url}/api/accounts/cookie
      → 成功：返回 cookies（来源 'remote'）
      → 失败：warn 并继续
  → 读取 data/cookies.json
      → 存在且未超过30天：返回 cookies（来源 'local'）
      → 否则：返回 null
```

BiliCookie 服务响应格式：
```json
{ "success": true, "data": { "uid": "123", "cookies": { "SESSDATA": "...", "bili_jct": "...", "DedeUserID": "..." } } }
```

---

## 发送限速（src/services/danmuSender.js）

所有弹幕经过内部 `_queue` 数组，用 `setInterval(3500ms)` 逐条消费。B站限制约每 3 秒一条，3.5 秒留有余量。队列排空时自动停止 interval，有新消息时重新启动。

**发送 API：**
```
POST https://api.live.bilibili.com/msg/send
Content-Type: application/x-www-form-urlencoded
Cookie: SESSDATA=xxx; DedeUserID=xxx; bili_jct=xxx

bubble=0&color=16777215&fontsize=25&mode=1&msg={内容}&rnd={时间戳}&roomid={房间号}&csrf={bili_jct}&csrf_token={bili_jct}
```

---

## Handler 设计约定

所有 Handler 构造函数签名相同：
```js
constructor(sender, getConfig, anchorId, selfUid?)
```

- `sender`：DanmuSender 实例，调用 `sender.push(msg, source)` 入队
- `getConfig`：函数，每次调用返回最新配置（热更新无需重建 Handler）
- `anchorId`：主播 UID（`number`，用于牌子归属判断），可能为 null
- `selfUid`：Bot 自身 UID 字符串（用于过滤自己发的消息）

**`type` 过滤逻辑（所有 Handler 统一）：**
```
0 → 全部用户
1 → 仅携带本直播间牌子的用户（medal.ruid === anchorId）
2 → 仅本直播间航海用户（medal.ruid === anchorId && guardLevel > 0）
```

guardLevel：`1`=总督 `2`=提督 `3`=舰长（注意与常识相反，1最高）

---

## 配置格式（data/config.json）

`DEFAULT_CONFIG` 定义在 `src/utils/storage.js`，是所有字段的权威定义。
`updateConfig(partial)` 对顶层对象做深合并（数组整体替换，不追加）。

```jsonc
{
  "roomId": 0,                     // 直播间号
  "gift": {
    "enabled": false,
    "minPrice": 1000,              // 单位：电池（1元=1000电池）
    "type": 0,                     // 0全部/1牌子/2航海
    "mergeWindow": 10000,          // 合并窗口毫秒，0禁用合并
    "messages": ["..."]            // @name@ @giftName@ @num@ @price@
  },
  "enter": {
    "enabled": false,
    "type": 0,
    "messages": ["..."]            // @name@ @guard@
  },
  "share": {
    "enabled": false,
    "type": 0,
    "messages": ["..."]            // @name@ @guard@
  },
  "autoReply": {
    "enabled": false,
    "rules": [{
      "enabled": true,
      "keywords": ["..."],         // 触发词（OR关系）
      "match": "exact",            // exact/contains/regex
      "safewords": ["..."],        // 安全词（命中则跳过此规则）
      "messages": ["..."],         // @name@ @msg@
      "type": 0,
      "cooldown": 0                // 单规则冷却秒数
    }]
  },
  "timing": {
    "enabled": false,
    "interval": 300,               // 秒，最小60
    "order": "sequence",           // sequence/random
    "messages": ["..."]
  }
}
```

---

## 扩展指南

### 添加新的事件处理器

1. 在 `src/handlers/` 新建 `xxxHandler.js`，实现 `handle(event)` 方法
2. 在 `src/services/bilibiliLiveWS.js` 的 `_handleCommand` 中添加事件解析和对应的 `this.onXxx` 回调
3. 在 `src/bot.js` 的 `_initHandlers()` 中实例化并绑定 `this._ws.onXxx`
4. 在 `src/utils/storage.js` 的 `DEFAULT_CONFIG` 中添加默认配置字段
5. 在 `src/routes/config.js` 中注册对应的 PUT 端点（或加入现有的分模块更新列表）

### 添加新的 WebSocket 命令

在 `bilibiliLiveWS.js` 的 `_handleCommand` switch 中添加新的 case，解析 `cmd.data` 字段，通过 `this.onXxx` 回调通知外部。

### 添加前端界面

在 `src/app.js` 中追加 `app.use(express.static(...))` 挂载静态目录，API 路由已全部以 `/api` 开头，不冲突。

---

## 已知限制与注意事项

- **弹幕长度**：B站弹幕最长 20 个字符，超长会被截断或报错，Handler 中未做截断处理
- **anchorId 初始化时机**：`_initHandlers()` 在 `ws.connect()` 调用前执行，此时 `ws.anchorId` 可能为 null（`getRealRoomId()` 尚未完成）。牌子过滤（type=1/2）在 Bot 刚启动的极短窗口内可能失效
- **金/银瓜子**：礼物答谢只处理金瓜子（付费）礼物，银瓜子（免费）礼物在 `giftHandler.js` 中直接过滤
- **守护购买**：`GUARD_BUY` 和 `USER_TOAST_MSG` 均会触发 `onGuard` 回调，但当前没有对应的 guardHandler，如需实现上舰感谢需自行添加
- **Cookie 续期**：本项目不做 Cookie 续期，依赖 BiliCookie 服务管理；本地 Cookie 30 天后过期需重新扫码
- **并发房间**：当前 Bot 只支持连接单个房间，如需多房间需重构 bot.js 或参考 Unia-Danmuku 的 roomManager 模式

---

## 依赖版本参考

```json
{
  "axios": "^1.6.2",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.18.2",
  "pako": "^2.1.0",
  "qrcode": "^1.5.3",
  "ws": "^8.18.3"
}
```
