import { applyTemplate, pickRandom } from '../utils/template.js';

export class GiftHandler {
  constructor(sender, getConfig, anchorId) {
    this.sender = sender;
    this.getConfig = getConfig;
    this.anchorId = anchorId;
    // 礼物合并窗口：uid → { uname, gifts: [{giftName, num, price}], timer }
    this._mergeMap = new Map();
  }

  handle(event) {
    const cfg = this.getConfig().gift;
    if (!cfg?.enabled) return;

    const { uid, uname, giftName, num, price, coinType, ruid, guardLevel } = event;

    // 只处理金瓜子（付费）礼物
    if (coinType !== 'gold') return;

    // 价格阈值（单位：电池 = 价格/1000 元宝）
    const totalPrice = price * num;
    if (totalPrice < (cfg.minPrice ?? 0)) return;

    // 牌子过滤
    if (!this._checkType(cfg.type, ruid, guardLevel)) return;

    if (cfg.mergeWindow > 0) {
      this._mergeGift(uid, uname, giftName, num, price, totalPrice, cfg);
    } else {
      this._sendThanks(uname, giftName, num, totalPrice, cfg);
    }
  }

  _mergeGift(uid, uname, giftName, num, price, totalPrice, cfg) {
    const key = uid;
    if (!this._mergeMap.has(key)) {
      this._mergeMap.set(key, { uname, gifts: [], timer: null });
    }
    const entry = this._mergeMap.get(key);
    clearTimeout(entry.timer);

    const existing = entry.gifts.find(g => g.giftName === giftName);
    if (existing) {
      existing.num += num;
      existing.totalPrice += totalPrice;
    } else {
      entry.gifts.push({ giftName, num, totalPrice });
    }

    entry.timer = setTimeout(() => {
      const { gifts } = entry;
      const totalAll = gifts.reduce((s, g) => s + g.totalPrice, 0);
      const giftSummary = gifts.map(g => `${g.giftName}×${g.num}`).join('、');
      this._sendThanks(uname, giftSummary, null, totalAll, cfg);
      this._mergeMap.delete(key);
    }, cfg.mergeWindow);
  }

  _sendThanks(uname, giftName, num, totalPrice, cfg) {
    const text = pickRandom(cfg.messages);
    if (!text) return;
    const msg = applyTemplate(text, { name: uname, giftName, num: num ?? '', price: Math.floor(totalPrice / 1000) });
    this.sender.push(msg, 'Gift');
  }

  _checkType(type, ruid, guardLevel) {
    switch (type) {
      case 0: return true;                                    // 全部
      case 1: return ruid === this.anchorId;                  // 仅本直播间牌子
      case 2: return ruid === this.anchorId && guardLevel > 0; // 仅航海
      default: return true;
    }
  }

  destroy() {
    for (const entry of this._mergeMap.values()) clearTimeout(entry.timer);
    this._mergeMap.clear();
  }
}
