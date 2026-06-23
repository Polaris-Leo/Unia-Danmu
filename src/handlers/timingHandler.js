import { pickRandom } from '../utils/template.js';

export class TimingHandler {
  constructor(sender, getConfig) {
    this.sender = sender;
    this.getConfig = getConfig;
    this._timer = null;
    this._index = 0;
  }

  start() {
    this.stop();
    const cfg = this.getConfig().timing;
    if (!cfg?.enabled || !cfg.messages?.length) return;

    const intervalMs = Math.max((cfg.interval ?? 300), 60) * 1000;
    this._timer = setInterval(() => {
      const cfg = this.getConfig().timing;
      if (!cfg?.enabled || !cfg.messages?.length) return;

      let text;
      if (cfg.order === 'random') {
        text = pickRandom(cfg.messages);
      } else {
        // 顺序循环
        text = cfg.messages[this._index % cfg.messages.length];
        this._index++;
      }
      if (text?.trim()) {
        this.sender.push(text.trim(), 'Timing');
      }
    }, intervalMs);

    console.log(`[Timing] 已启动，间隔 ${cfg.interval}s，模式: ${cfg.order || 'sequence'}`);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  restart() {
    this.stop();
    this.start();
  }
}
