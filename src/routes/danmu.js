import express from 'express';

export function createDanmuRouter(bot) {
  const router = express.Router();

  router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const onMessage = (msg) => send(msg);
    bot.on('message', onMessage);

    const keepalive = setInterval(() => res.write(': ping\n\n'), 25000);

    req.on('close', () => {
      bot.off('message', onMessage);
      clearInterval(keepalive);
    });
  });

  return router;
}
