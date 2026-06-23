import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAuthRouter } from './routes/auth.js';
import { createConfigRouter } from './routes/config.js';
import { createBotRouter } from './routes/bot.js';
import { createDanmuRouter } from './routes/danmu.js';
import { createRoomRouter } from './routes/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(bot) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', createAuthRouter(bot));
  app.use('/api/config', createConfigRouter(bot));
  app.use('/api/bot', createBotRouter(bot));
  app.use('/api/danmu', createDanmuRouter(bot));
  app.use('/api/room', createRoomRouter());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use(express.static(path.join(__dirname, '../public')));

  return app;
}
