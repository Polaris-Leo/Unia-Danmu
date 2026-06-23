import express from 'express';

export function createBotRouter(bot) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json({ success: true, data: bot.getStatusInfo() });
  });

  router.post('/start', async (req, res) => {
    try {
      const { roomId } = req.body;
      await bot.start(roomId ? Number(roomId) : undefined);
      res.json({ success: true, data: bot.getStatusInfo() });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  router.post('/stop', (req, res) => {
    bot.stop();
    res.json({ success: true });
  });

  router.post('/send', async (req, res) => {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: '消息不能为空' });
    if (!bot._sender) return res.status(400).json({ success: false, message: 'Bot未启动' });
    bot._sender.push(message.trim(), 'Manual');
    res.json({ success: true });
  });

  return router;
}
