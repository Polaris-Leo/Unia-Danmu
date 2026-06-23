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

    if (process.env.ROOM_ID) {
      console.log(`[Boot] 自动启动 Bot，房间号: ${process.env.ROOM_ID}`);
      bot.start().catch(e => console.error('[Boot] 自动启动失败:', e.message));
    } else {
      console.warn('[Boot] 未配置 ROOM_ID，请在 .env 中设置后重启');
    }
  });
}

main().catch(e => {
  console.error('[Boot] 启动失败:', e);
  process.exit(1);
});
