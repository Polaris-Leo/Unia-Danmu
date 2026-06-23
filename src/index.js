import 'dotenv/config';
import { createApp } from './app.js';
import { DanmuBot } from './bot.js';
import { loadCookiesWithSource } from './services/cookieManager.js';

const PORT = process.env.PORT || 3200;

async function main() {
  const bot = new DanmuBot();

  // 预加载Cookie（不自动启动，等待API调用）
  const { cookies, source } = await loadCookiesWithSource();
  if (cookies) {
    bot._cookies = cookies;
    bot._selfUid = cookies.DedeUserID || null;
    bot._cookieSource = source;
    console.log(`[Boot] Cookie已加载 (来源: ${source}), UID: ${bot._selfUid || '?'}`);
  } else {
    console.warn('[Boot] 未找到Cookie，请通过 /api/auth/qrcode 扫码登录或配置BiliCookie服务');
  }

  const app = createApp(bot);
  app.listen(PORT, () => {
    console.log(`[Boot] Unia-Danmu 已启动: http://localhost:${PORT}`);
    console.log('[Boot] API文档:');
    console.log('  GET  /api/auth/qrcode    — 获取扫码登录二维码');
    console.log('  GET  /api/auth/poll?key= — 轮询扫码状态');
    console.log('  GET  /api/auth/status    — 查看登录状态');
    console.log('  POST /api/bot/start      — 启动Bot (body: {roomId})');
    console.log('  POST /api/bot/stop       — 停止Bot');
    console.log('  GET  /api/bot/status     — Bot状态');
    console.log('  POST /api/bot/send       — 手动发送弹幕 (body: {message})');
    console.log('  GET  /api/config         — 获取配置');
    console.log('  PUT  /api/config         — 更新全量配置');
    console.log('  PUT  /api/config/gift    — 更新礼物答谢配置');
    console.log('  PUT  /api/config/enter   — 更新进房欢迎配置');
    console.log('  PUT  /api/config/share   — 更新感谢分享配置');
    console.log('  PUT  /api/config/autoReply — 更新自动回复配置');
    console.log('  PUT  /api/config/timing  — 更新定时发送配置');
  });
}

main().catch(e => {
  console.error('[Boot] 启动失败:', e);
  process.exit(1);
});
