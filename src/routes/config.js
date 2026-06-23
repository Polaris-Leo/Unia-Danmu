import express from 'express';
import { loadConfig, saveConfig } from '../utils/storage.js';

export function createConfigRouter(bot) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ success: true, data: bot.getConfig() });
  });

  router.put('/', (req, res) => {
    try {
      const current = loadConfig();
      const merged = deepMerge(current, req.body);
      saveConfig(merged);
      bot._config = merged;
      if (bot._handlers?.timing) bot._handlers.timing.restart();
      res.json({ success: true, data: merged });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // 分项更新各模块配置
  for (const section of ['gift', 'enter', 'share', 'autoReply', 'timing']) {
    router.put(`/${section}`, (req, res) => {
      try {
        const current = loadConfig();
        current[section] = { ...current[section], ...req.body };
        saveConfig(current);
        bot._config = current;
        if (section === 'timing' && bot._handlers?.timing) bot._handlers.timing.restart();
        res.json({ success: true, data: current[section] });
      } catch (e) {
        res.status(500).json({ success: false, message: e.message });
      }
    });
  }

  return router;
}

function deepMerge(base, patch) {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    if (patch[key] !== null && typeof patch[key] === 'object' && !Array.isArray(patch[key]) && typeof base[key] === 'object') {
      result[key] = deepMerge(base[key], patch[key]);
    } else {
      result[key] = patch[key];
    }
  }
  return result;
}
