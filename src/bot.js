import { BilibiliLiveWS } from './services/bilibiliLiveWS.js';
import { DanmuSender } from './services/danmuSender.js';
import { loadCookies, saveCookies } from './services/cookieManager.js';
import { loadConfig, saveConfig, updateConfig } from './utils/storage.js';
import { GiftHandler } from './handlers/giftHandler.js';
import { EnterHandler } from './handlers/enterHandler.js';
import { ShareHandler } from './handlers/shareHandler.js';
import { AutoReplyHandler } from './handlers/autoReplyHandler.js';
import { TimingHandler } from './handlers/timingHandler.js';

export class DanmuBot {
  constructor() {
    this._config = loadConfig();
    this._cookies = null;
    this._selfUid = null;
    this._ws = null;
    this._sender = null;
    this._handlers = {};
    this.status = 'idle'; // idle | connecting | running | error
    this.statusMsg = '';
  }

  /** 当前配置（只读引用） */
  getConfig() { return this._config; }

  /** 重新从磁盘加载配置并热更新各Handler */
  reloadConfig() {
    this._config = loadConfig();
    if (this._handlers.timing) this._handlers.timing.restart();
    console.log('[Bot] 配置已热重载');
    return this._config;
  }

  /** 更新并保存配置 */
  patchConfig(partial) {
    this._config = updateConfig(partial);
    if (this._handlers.timing) this._handlers.timing.restart();
    return this._config;
  }

  /** 设置Cookie（登录后调用） */
  setCookies(cookies) {
    this._cookies = cookies;
    this._selfUid = cookies?.DedeUserID || null;
    saveCookies(cookies);
    if (this._sender) this._sender.updateCookies(cookies);
    if (this._ws) this._ws.updateCookies(cookies);
  }

  getCookies() { return this._cookies; }
  getSelfUid() { return this._selfUid; }

  /**
   * 启动Bot：加载Cookie → 连接WebSocket → 启动各Handler
   */
  async start(roomId) {
    if (roomId) {
      this._config.roomId = roomId;
      saveConfig(this._config);
    }
    if (!this._config.roomId) {
      this.status = 'error';
      this.statusMsg = '未配置房间号';
      return;
    }

    // 加载Cookie
    if (!this._cookies) {
      this._cookies = await loadCookies();
    }
    if (this._cookies) {
      this._selfUid = this._cookies.DedeUserID || null;
    } else {
      console.warn('[Bot] 未找到有效Cookie，将以游客身份连接（无法发送弹幕）');
    }

    this.status = 'connecting';
    this.statusMsg = '';

    // 初始化发送器
    this._sender = new DanmuSender(this._config.roomId, this._cookies);

    // 初始化WebSocket
    this._ws = new BilibiliLiveWS(this._config.roomId, this._cookies);
    this._ws.onConnect = () => {
      this.status = 'running';
      // 启动定时发送
      if (this._handlers.timing) this._handlers.timing.start();
    };
    this._ws.onClose = () => {
      if (this.status !== 'idle') this.status = 'connecting';
      if (this._handlers.timing) this._handlers.timing.stop();
    };
    this._ws.onError = (e) => {
      this.status = 'error';
      this.statusMsg = e.message;
    };

    // 绑定事件到Handler
    this._initHandlers();

    await this._ws.connect();
  }

  /** 停止Bot */
  stop() {
    if (this._ws) { this._ws.disconnect(); this._ws = null; }
    if (this._handlers.timing) this._handlers.timing.stop();
    if (this._sender) { this._sender.destroy(); this._sender = null; }
    this.status = 'idle';
    this.statusMsg = '';
    console.log('[Bot] 已停止');
  }

  _initHandlers() {
    const getConfig = () => this._config;
    const anchorId = this._ws.anchorId;

    this._handlers.gift = new GiftHandler(this._sender, getConfig, anchorId);
    this._handlers.enter = new EnterHandler(this._sender, getConfig, anchorId, this._selfUid);
    this._handlers.share = new ShareHandler(this._sender, getConfig, anchorId, this._selfUid);
    this._handlers.autoReply = new AutoReplyHandler(this._sender, getConfig, anchorId, this._selfUid);
    this._handlers.timing = new TimingHandler(this._sender, getConfig);

    this._ws.onGift = (e) => this._handlers.gift.handle(e);
    this._ws.onEnter = (e) => this._handlers.enter.handle(e);
    this._ws.onShare = (e) => this._handlers.share.handle(e);
    this._ws.onDanmaku = (e) => this._handlers.autoReply.handle(e);

    this._ws.onLiveStatus = ({ isLive }) => {
      console.log(`[Bot] 直播状态: ${isLive ? '开播' : '下播'}`);
    };
  }

  getStatusInfo() {
    return {
      status: this.status,
      statusMsg: this.statusMsg,
      roomId: this._config.roomId,
      isConnected: this._ws?.isConnected ?? false,
      hasCredential: !!this._cookies?.SESSDATA,
      selfUid: this._selfUid,
      cookieSource: this._cookieSource || null,
    };
  }
}
