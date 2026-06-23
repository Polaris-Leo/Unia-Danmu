import axios from 'axios';
import QRCode from 'qrcode';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const QR_CODE_STATUS = {
  SUCCESS: 0,
  KEY_ERROR: 86038,
  NOT_SCANNED: 86101,
  SCANNED: 86090,
};

export async function generateQRCode() {
  const res = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', {
    headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com' },
    timeout: 10000,
  });
  if (res.data.code !== 0) throw new Error(`获取二维码失败: ${res.data.message}`);
  const { url, qrcode_key } = res.data.data;
  const qrcode_image = await QRCode.toDataURL(url, { width: 300, margin: 2 });
  return { url, qrcode_key, qrcode_image, expires_in: 180 };
}

export async function pollQRCode(qrcode_key) {
  const res = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/poll', {
    params: { qrcode_key },
    headers: { 'User-Agent': UA },
  });
  const setCookieHeader = res.headers['set-cookie'];
  let cookies = null;
  if (setCookieHeader && res.data.data?.code === QR_CODE_STATUS.SUCCESS) {
    cookies = _parseCookies(setCookieHeader);
  }
  return { data: res.data.data, cookies };
}

function _parseCookies(setCookieArray) {
  return setCookieArray.map(cookieStr => {
    const [nameValue] = cookieStr.split(';');
    const eqIdx = nameValue.indexOf('=');
    const name = nameValue.slice(0, eqIdx).trim();
    const value = nameValue.slice(eqIdx + 1).trim();
    return { name, value };
  });
}

export async function fetchBuvid(cookieObj) {
  try {
    const cookieStr = Object.entries(cookieObj).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await axios.get('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/', 'Cookie': cookieStr },
      timeout: 5000,
    });
    if (res.data.code === 0 && res.data.data) {
      const { b_3, b_4 } = res.data.data;
      return { buvid3: b_3, buvid4: b_4 };
    }
  } catch (e) {
    console.warn('[Auth] 获取buvid失败:', e.message);
  }
  return null;
}

export async function fetchUserInfo(cookieObj) {
  try {
    const cookieStr = Object.entries(cookieObj).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
      headers: { 'User-Agent': UA, 'Cookie': cookieStr },
      timeout: 5000,
    });
    if (res.data.code === 0 && res.data.data?.isLogin) {
      const d = res.data.data;
      return { uid: d.mid, uname: d.uname, avatar: d.face, isLogin: true };
    }
  } catch (e) {
    console.warn('[Auth] 获取用户信息失败:', e.message);
  }
  return null;
}
