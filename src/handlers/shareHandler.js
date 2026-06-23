import { applyTemplate, pickRandom } from '../utils/template.js';

export class ShareHandler {
  constructor(sender, getConfig, anchorId, selfUid) {
    this.sender = sender;
    this.getConfig = getConfig;
    this.anchorId = anchorId;
    this.selfUid = selfUid;
  }

  handle(event) {
    const cfg = this.getConfig().share;
    if (!cfg?.enabled) return;
    const { uid, uname, ruid, guardLevel } = event;

    if (uid && uid == this.selfUid) return;
    if (!this._checkType(cfg.type, ruid, guardLevel)) return;

    const guardLabel = this._guardLabel(guardLevel);
    const text = pickRandom(cfg.messages);
    if (!text) return;
    const msg = applyTemplate(text, { name: uname, guard: guardLabel });
    this.sender.push(msg, 'Share');
  }

  _checkType(type, ruid, guardLevel) {
    switch (type) {
      case 0: return true;
      case 1: return ruid === this.anchorId;
      case 2: return ruid === this.anchorId && guardLevel > 0;
      default: return true;
    }
  }

  _guardLabel(level) {
    switch (level) {
      case 1: return '总督';
      case 2: return '提督';
      case 3: return '舰长';
      default: return '';
    }
  }
}
