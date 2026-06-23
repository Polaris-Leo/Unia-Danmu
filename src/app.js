import express from 'express';
import cors from 'cors';
import { createAuthRouter } from './routes/auth.js';
import { createConfigRouter } from './routes/config.js';
import { createBotRouter } from './routes/bot.js';

export function createApp(bot) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', createAuthRouter(bot));
  app.use('/api/config', createConfigRouter(bot));
  app.use('/api/bot', createBotRouter(bot));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  return app;
}
