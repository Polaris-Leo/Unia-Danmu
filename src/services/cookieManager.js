import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = path.join(__dirname, '../../data/cookies.json');
const COOKIE_TTL_DAYS = 30;

function getCookieManagerUrl() {
  return (process.env.COOKIE_MANAGER_URL || '').replace(/\/$/, '');
}

function _fetchFromManager() {
  const base = getCookieManagerUrl();
  if (!base) return Promise.resolve(null);

  return new Promise(resolve => {
    const url = `${base}/api/accounts/cookie`;
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 3000 }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.success && data.data?.cookies) {
            console.log(`[Cookie] BiliCookie服务 — UID: ${data.data.uid || '?'}`);
            resolve(data.data.cookies);
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function _loadFromFile() {
  try {
    if (!fs.existsSync(COOKIE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    const daysPassed = (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24);
    if (daysPassed > COOKIE_TTL_DAYS) {
      console.warn('[Cookie] 本地Cookie已过期');
      return null;
    }
    console.log(`[Cookie] 本地文件 — 保存于 ${data.date}`);
    return data.cookies;
  } catch (e) {
    console.error('[Cookie] 加载本地Cookie失败:', e.message);
    return null;
  }
}

/**
 * 加载Cookie：优先BiliCookie服务，其次本地文件
 */
export async function loadCookies() {
  if (getCookieManagerUrl()) {
    const remote = await _fetchFromManager();
    if (remote) return remote;
    console.warn('[Cookie] BiliCookie服务不可用，回退本地文件');
  }
  return _loadFromFile();
}

export async function loadCookiesWithSource() {
  if (getCookieManagerUrl()) {
    const remote = await _fetchFromManager();
    if (remote) return { cookies: remote, source: 'remote' };
    console.warn('[Cookie] BiliCookie服务不可用，回退本地文件');
  }
  const local = _loadFromFile();
  return { cookies: local, source: local ? 'local' : null };
}

export function saveCookies(cookies) {
  try {
    const dir = path.dirname(COOKIE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(COOKIE_FILE, JSON.stringify({
      cookies,
      timestamp: Date.now(),
      date: new Date().toISOString(),
    }, null, 2));
    console.log('[Cookie] 已保存到本地');
    return true;
  } catch (e) {
    console.error('[Cookie] 保存失败:', e.message);
    return false;
  }
}

export function clearCookies() {
  try {
    if (fs.existsSync(COOKIE_FILE)) fs.unlinkSync(COOKIE_FILE);
    return true;
  } catch (e) {
    console.error('[Cookie] 清除失败:', e.message);
    return false;
  }
}

export function getCookieString(cookies) {
  if (!cookies) return '';
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}
