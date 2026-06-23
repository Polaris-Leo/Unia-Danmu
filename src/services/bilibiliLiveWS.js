import WebSocket from 'ws';
import axios from 'axios';
import pako from 'pako';
import zlib from 'zlib';
import crypto from 'crypto';
import { getCookieString } from './cookieManager.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class BilibiliLiveWS {
  constructor(roomId, cookies = null) {
    this.roomId = roomId;
    this.cookies = cookies;
    this.ws = null;
    this.heartbeatTimer = null;
    this.isConnected = false;
    this.authInfo = null;
    this.buvid = '';
    this._wbiKey = '';
    this._wbiKeyExpiry = 0;
    this.anchorId = null;
    this._intentionalDisconnect = false;
    this._reconnectTimer = null;
    this._reconnectDelay = 5000;

    // 事件回调
    this.onDanmaku = null;
    this.onGift = null;
    this.onGuard = null;
    this.onEnter = null;
    this.onShare = null;
    this.onConnect = null;
    this.onClose = null;
    this.onError = null;
    this.onLiveStatus = null;
  }

  updateCookies(cookies) {
    this.cookies = cookies;
    this.buvid = cookies?.buvid3 || this.buvid || '';
  }

  async getRealRoomId() {
    const res = await axios.get('https://api.live.bilibili.com/room/v1/Room/room_init', {
      params: { id: this.roomId },
      headers: { 'User-Agent': UA }
    });
    if (res.data.code !== 0) throw new Error(`获取房间信息失败: ${res.data.message}`);
    this.anchorId = res.data.data.uid;
    return res.data.data.room_id;
  }

  async initBuvid() {
    try {
      const headers = { 'User-Agent': UA };
      if (this.cookies) headers['Cookie'] = getCookieString(this.cookies);
      const res = await axios.get('https://www.bilibili.com/', { headers, timeout: 5000 });
      const setCookies = res.headers['set-cookie'] || [];
      for (const c of setCookies) {
        const m = c.match(/buvid3=([^;]+)/);
        if (m) { this.buvid = m[1]; return; }
      }
      if (this.cookies?.buvid3) this.buvid = this.cookies.buvid3;
    } catch (e) {
      console.warn('[WS] 获取buvid失败:', e.message);
    }
  }

  async getWbiKey() {
    const now = Date.now();
    if (this._wbiKey && now < this._wbiKeyExpiry) return this._wbiKey;
    try {
      const headers = { 'User-Agent': UA };
      if (this.cookies) headers['Cookie'] = getCookieString(this.cookies);
      const res = await axios.get('https://api.bilibili.com/x/web-interface/nav', { headers, timeout: 5000 });
      const wbiImg = res.data?.data?.wbi_img;
      if (!wbiImg) throw new Error('wbi_img not found');
      const imgKey = wbiImg.img_url.split('/').pop().split('.')[0];
      const subKey = wbiImg.sub_url.split('/').pop().split('.')[0];
      const shuffled = imgKey + subKey;
      const KEY_INDEX = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13];
      this._wbiKey = KEY_INDEX.map(i => shuffled[i] || '').join('');
      this._wbiKeyExpiry = now + 11.5 * 60 * 60 * 1000;
    } catch (e) {
      console.warn('[WS] 获取WBI密钥失败:', e.message);
    }
    return this._wbiKey;
  }

  async _addWbiSign(params) {
    const wbiKey = await this.getWbiKey();
    if (!wbiKey) return params;
    const wts = String(Math.floor(Date.now() / 1000));
    const toSign = { ...params, wts };
    const sorted = Object.keys(toSign).sort().reduce((acc, k) => {
      acc[k] = String(toSign[k]).replace(/[!'()*]/g, '');
      return acc;
    }, {});
    const query = new URLSearchParams(sorted).toString();
    const w_rid = crypto.createHash('md5').update(query + wbiKey).digest('hex');
    return { ...params, wts, w_rid };
  }

  async getDanmuInfo() {
    const headers = {
      'User-Agent': UA,
      'Referer': `https://live.bilibili.com/${this.roomId}`,
      'Origin': 'https://live.bilibili.com',
    };
    if (this.cookies) headers['Cookie'] = getCookieString(this.cookies);
    const params = await this._addWbiSign({ id: this.roomId, type: 0 });
    const res = await axios.get(
      'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo',
      { params, headers, timeout: 8000 }
    );
    if (res.data.code !== 0) {
      const err = new Error(`获取弹幕服务器信息失败: ${res.data.message}`);
      const code = res.data.code;
      if (code === -101 || code === -400 || code === -403) err.isAuthError = true;
      throw err;
    }
    return { token: res.data.data.token, host_list: res.data.data.host_list || [] };
  }

  async connect() {
    if (this.ws) {
      this._intentionalDisconnect = true;
      this.disconnect();
    }
    this._intentionalDisconnect = false;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }

    try {
      this.roomId = await this.getRealRoomId();
      console.log(`[WS] 真实房间号: ${this.roomId}`);
      if (!this.buvid) await this.initBuvid();
      this.authInfo = await this.getDanmuInfo();
      const host = this.authInfo.host_list[0];
      const wsUrl = `wss://${host.host}:${host.wss_port}/sub`;
      console.log(`[WS] 正在连接 ${this.roomId}...`);
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => this._onOpen();
      this.ws.onmessage = (e) => this._onMessage(e);
      this.ws.onerror = (e) => this._onError(e);
      this.ws.onclose = () => this._onClose();
    } catch (e) {
      console.error('[WS] 连接失败:', e.message);
      if (this.onError) this.onError(e);
      this._scheduleReconnect();
    }
  }

  disconnect() {
    this._intentionalDisconnect = true;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.isConnected = false;
  }

  _scheduleReconnect() {
    if (this._intentionalDisconnect) return;
    console.log(`[WS] ${this._reconnectDelay / 1000}s 后重连...`);
    this._reconnectTimer = setTimeout(() => this.connect(), this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 60000);
  }

  _onOpen() {
    console.log('[WS] 连接成功');
    this.isConnected = true;
    this._reconnectDelay = 5000;
    this._sendAuth();
    this._startHeartbeat();
    if (this.onConnect) this.onConnect();
  }

  _sendAuth() {
    const uid = this.cookies?.DedeUserID ? parseInt(this.cookies.DedeUserID) : 0;
    const authData = {
      uid,
      roomid: this.roomId,
      protover: 3,
      platform: 'web',
      type: 2,
      key: this.authInfo.token,
      ...(this.buvid ? { buvid: this.buvid } : {}),
    };
    this.ws.send(this._createPacket(JSON.stringify(authData), 7));
    console.log('[WS] 认证包已发送, uid:', uid || '(游客)');
  }

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(this._createPacket(Buffer.alloc(0), 2));
      }
    }, 30000);
  }

  _createPacket(data, operation) {
    const body = typeof data === 'string' ? Buffer.from(data) : data;
    const header = Buffer.alloc(16);
    header.writeUInt32BE(header.length + body.length, 0);
    header.writeUInt16BE(16, 4);
    header.writeUInt16BE(1, 6);
    header.writeUInt32BE(operation, 8);
    header.writeUInt32BE(1, 12);
    return Buffer.concat([header, body]);
  }

  _onMessage(event) {
    try {
      this._parsePacket(Buffer.from(event.data));
    } catch (e) {
      console.error('[WS] 解析消息失败:', e.message);
    }
  }

  _parsePacket(buffer) {
    if (buffer.length < 16) return;
    const packLen = buffer.readUInt32BE(0);
    const headerLen = buffer.readUInt16BE(4);
    const ver = buffer.readUInt16BE(6);
    const op = buffer.readUInt32BE(8);
    const body = buffer.slice(headerLen, packLen);

    if (ver === 2) {
      const decompressed = Buffer.from(pako.inflate(body));
      let offset = 0;
      while (offset < decompressed.length) {
        const subLen = decompressed.readUInt32BE(offset);
        if (subLen <= 0 || offset + subLen > decompressed.length) break;
        this._parsePacket(decompressed.slice(offset, offset + subLen));
        offset += subLen;
      }
    } else if (ver === 3) {
      try {
        const decompressed = zlib.brotliDecompressSync(body);
        let offset = 0;
        while (offset < decompressed.length) {
          const subLen = decompressed.readUInt32BE(offset);
          if (subLen <= 0 || offset + subLen > decompressed.length) break;
          this._parsePacket(decompressed.slice(offset, offset + subLen));
          offset += subLen;
        }
      } catch (e) {
        console.warn('[WS] Brotli解压失败:', e.message);
      }
    } else if (op === 5) {
      try {
        this._handleCommand(JSON.parse(body.toString('utf-8')));
      } catch (_) {}
    }
  }

  _handleCommand(cmd) {
    if (!cmd?.cmd) return;
    const cmdStr = cmd.cmd.split(':')[0];

    switch (cmdStr) {
      case 'DANMU_MSG': {
        const info = cmd.info || [];
        const userInfo = info[2] || [];
        const medalInfo = info[3] || [];
        if (this.onDanmaku) {
          this.onDanmaku({
            uid: userInfo[0],
            uname: userInfo[1] || '未知',
            content: info[1] || '',
            medal: {
              level: medalInfo[0] || 0,
              name: medalInfo[1] || '',
              ruid: medalInfo[12] || 0,
              guardLevel: medalInfo[10] || 0,
            },
          });
        }
        break;
      }
      case 'SEND_GIFT': {
        const d = cmd.data || {};
        if (this.onGift) {
          this.onGift({
            uid: d.uid,
            uname: d.uname || '未知',
            giftId: d.giftId,
            giftName: d.giftName || '礼物',
            num: d.num || 1,
            price: d.price || 0,
            coinType: d.coin_type || 'silver',
            ruid: d.medal_info?.target_id || 0,
            guardLevel: d.medal_info?.guard_level || 0,
          });
        }
        break;
      }
      case 'GUARD_BUY':
      case 'USER_TOAST_MSG': {
        const d = cmd.data || {};
        if (this.onGuard) {
          this.onGuard({
            uid: d.uid,
            uname: d.username || d.uname || '未知',
            guardLevel: d.guard_level,
            num: d.num || 1,
            price: d.price || 0,
          });
        }
        break;
      }
      case 'INTERACT_WORD': {
        const d = cmd.data || {};
        const msgType = d.msg_type || 1;
        // 1=进房 2=关注 3=分享 4=特别关注
        if (msgType === 1 || msgType === 2) {
          if (this.onEnter) {
            this.onEnter({
              uid: d.uid,
              uname: d.uname || '未知',
              ruid: d.fans_medal?.target_id || 0,
              guardLevel: d.fans_medal?.guard_level || 0,
              msgType,
            });
          }
        } else if (msgType === 3) {
          if (this.onShare) {
            this.onShare({
              uid: d.uid,
              uname: d.uname || '未知',
              ruid: d.fans_medal?.target_id || 0,
              guardLevel: d.fans_medal?.guard_level || 0,
            });
          }
        }
        break;
      }
      case 'LIVE':
        if (this.onLiveStatus) this.onLiveStatus({ isLive: true });
        break;
      case 'PREPARING':
        if (this.onLiveStatus) this.onLiveStatus({ isLive: false });
        break;
    }
  }

  _onError(error) {
    console.error('[WS] 错误:', error.message);
    if (this.onError) this.onError(error);
  }

  _onClose() {
    console.log('[WS] 连接断开');
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.isConnected = false;
    this.ws = null;
    if (this.onClose) this.onClose();
    this._scheduleReconnect();
  }
}
