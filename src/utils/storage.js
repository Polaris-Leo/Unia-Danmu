import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  roomId: 0,
  gift: {
    enabled: false,
    onlyWhenLive: false,
    minPrice: 1000,
    type: 0,
    mergeWindow: 10000,
    messages: ['感谢 @name@ 送来的 @giftName@！'],
  },
  enter: {
    enabled: false,
    onlyWhenLive: false,
    type: 0,
    messages: ['欢迎 @name@ 进入直播间~'],
  },
  share: {
    enabled: false,
    onlyWhenLive: false,
    type: 0,
    messages: ['感谢 @name@ 分享了直播间！'],
  },
  autoReply: {
    enabled: false,
    onlyWhenLive: false,
    rules: [],
  },
  timing: {
    enabled: false,
    onlyWhenLive: false,
    interval: 300,
    order: 'sequence',
    messages: ['欢迎来到直播间～'],
  },
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadConfig() {
  ensureDataDir();
  const envRoomId = process.env.ROOM_ID ? Number(process.env.ROOM_ID) : null;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      const merged = { ...DEFAULT_CONFIG, ...raw };
      if (envRoomId) merged.roomId = envRoomId;
      return merged;
    }
  } catch (e) {
    console.error('[Storage] 加载配置失败:', e.message);
  }
  return { ...DEFAULT_CONFIG, ...(envRoomId ? { roomId: envRoomId } : {}) };
}

export function saveConfig(config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function updateConfig(partial) {
  const current = loadConfig();
  const merged = deepMerge(current, partial);
  saveConfig(merged);
  return merged;
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
