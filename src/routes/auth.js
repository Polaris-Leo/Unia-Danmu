import express from 'express';
import {
  generateQRCode,
  pollQRCode,
  fetchBuvid,
  fetchUserInfo,
  QR_CODE_STATUS,
} from '../services/bilibiliAuth.js';
import { clearCookies } from '../services/cookieManager.js';

export function createAuthRouter(bot) {
  const router = express.Router();

  router.get('/qrcode', async (req, res) => {
    try {
      const data = await generateQRCode();
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  router.get('/poll', async (req, res) => {
    const { key } = req.query;
    if (!key) return res.status(400).json({ success: false, message: '缺少key参数' });

    try {
      const result = await pollQRCode(key);
      const code = result.data?.code;

      if (code === QR_CODE_STATUS.SUCCESS && result.cookies) {
        const cookieObj = {};
        result.cookies.forEach(c => { if (c.name && c.value) cookieObj[c.name] = c.value; });

        const buvid = await fetchBuvid(cookieObj);
        if (buvid) Object.assign(cookieObj, buvid);

        bot.setCookies(cookieObj);

        const userInfo = await fetchUserInfo(cookieObj);
        return res.json({ success: true, data: result.data, user: userInfo });
      }

      res.json({ success: true, data: result.data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  router.post('/logout', (req, res) => {
    clearCookies();
    bot.setCookies(null);
    res.json({ success: true });
  });

  router.get('/status', async (req, res) => {
    const cookies = bot.getCookies();
    if (!cookies?.SESSDATA) {
      return res.json({ success: true, data: { isLogin: false } });
    }
    const userInfo = await fetchUserInfo(cookies).catch(() => null);
    res.json({ success: true, data: userInfo || { isLogin: false } });
  });

  return router;
}
