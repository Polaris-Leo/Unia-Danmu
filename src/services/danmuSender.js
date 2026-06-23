import axios from 'axios';
import { getCookieString } from './cookieManager.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// B站发送弹幕限速：每条至少间隔3秒
const SEND_INTERVAL = 3500;

export class DanmuSender {
  constructor(roomId, cookies) {
    this.roomId = roomId;
    this.cookies = cookies;
    this._queue = [];
    this._timer = null;
    this._sending = false;
  }

  updateCookies(cookies) {
    this.cookies = cookies;
  }

  /**
   * 将消息加入发送队列
   * @param {string} message
   * @param {string} [source] 来源标签（仅用于日志）
   */
  push(message, source = '') {
    if (!message?.trim()) return;
    this._queue.push({ message: message.trim(), source });
    this._startDrain();
  }

  _startDrain() {
    if (this._timer) return;
    this._timer = setInterval(() => this._drain(), SEND_INTERVAL);
  }

  async _drain() {
    if (this._sending || this._queue.length === 0) return;
    const item = this._queue.shift();
    this._sending = true;
    try {
      await this._send(item.message);
      console.log(`[Sender] [${item.source || '-'}] 已发送: ${item.message}`);
    } catch (e) {
      console.error(`[Sender] 发送失败: ${e.message}`);
    } finally {
      this._sending = false;
      if (this._queue.length === 0) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }
  }

  async _send(message) {
    if (!this.cookies?.SESSDATA || !this.cookies?.bili_jct) {
      throw new Error('缺少登录Cookie，无法发送弹幕');
    }
    const csrf = this.cookies.bili_jct;
    const params = new URLSearchParams({
      bubble: '0',
      color: '16777215',
      fontsize: '25',
      mode: '1',
      msg: message,
      rnd: String(Math.floor(Date.now() / 1000)),
      roomid: String(this.roomId),
      csrf,
      csrf_token: csrf,
    });
    const res = await axios.post(
      'https://api.live.bilibili.com/msg/send',
      params.toString(),
      {
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `https://live.bilibili.com/${this.roomId}`,
          'Cookie': getCookieString(this.cookies),
        },
        timeout: 8000,
      }
    );
    if (res.data.code !== 0) {
      throw new Error(`发送弹幕失败 (${res.data.code}): ${res.data.message}`);
    }
  }

  clearQueue() {
    this._queue = [];
  }

  destroy() {
    clearInterval(this._timer);
    this._timer = null;
    this._queue = [];
  }
}
