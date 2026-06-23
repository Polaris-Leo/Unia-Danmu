import { applyTemplate, pickRandom } from '../utils/template.js';

export class AutoReplyHandler {
  constructor(sender, getConfig, anchorId, selfUid) {
    this.sender = sender;
    this.getConfig = getConfig;
    this.anchorId = anchorId;
    this.selfUid = selfUid;
    // 每个规则的冷却：ruleIndex → lastTriggeredAt
    this._cooldowns = new Map();
  }

  handle(event) {
    const cfg = this.getConfig().autoReply;
    if (!cfg?.enabled) return;
    const { uid, uname, content, medal } = event;

    if (uid && uid == this.selfUid) return;

    const rules = cfg.rules || [];
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule.enabled) continue;
      if (!this._matchKeywords(content, rule.keywords, rule.match)) continue;

      // 安全词检测
      if (rule.safewords?.length && this._matchAny(content, rule.safewords)) continue;

      // 牌子过滤
      if (!this._checkType(rule.type, medal?.ruid, medal?.guardLevel)) continue;

      // 冷却检测（毫秒）
      const cooldown = (rule.cooldown ?? 0) * 1000;
      if (cooldown > 0) {
        const last = this._cooldowns.get(i) || 0;
        if (Date.now() - last < cooldown) continue;
        this._cooldowns.set(i, Date.now());
      }

      const text = pickRandom(rule.messages);
      if (!text) continue;
      const msg = applyTemplate(text, { name: uname, msg: content });
      this.sender.push(msg, 'AutoReply');
      break; // 每条弹幕只触发第一条匹配规则
    }
  }

  _matchKeywords(content, keywords, matchType) {
    if (!keywords?.length) return false;
    if (matchType === 'regex') {
      return keywords.some(k => {
        try { return new RegExp(k).test(content); } catch { return false; }
      });
    }
    if (matchType === 'contains') {
      return keywords.some(k => content.includes(k));
    }
    // 默认 exact
    return keywords.some(k => content === k);
  }

  _matchAny(content, keywords) {
    return keywords.some(k => content.includes(k));
  }

  _checkType(type, ruid, guardLevel) {
    switch (type) {
      case 1: return ruid === this.anchorId;
      case 2: return ruid === this.anchorId && guardLevel > 0;
      default: return true;
    }
  }
}
