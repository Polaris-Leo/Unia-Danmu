import { EventEmitter } from 'events';
import { BilibiliLiveWS } from './services/bilibiliLiveWS.js';
import { DanmuSender } from './services/danmuSender.js';
import { loadCookies, saveCookies } from './services/cookieManager.js';
import { loadConfig, saveConfig, updateConfig } from './utils/storage.js';
import { GiftHandler } from './handlers/giftHandler.js';
import { EnterHandler } from './handlers/enterHandler.js';
import { ShareHandler } from './handlers/shareHandler.js';
import { AutoReplyHandler } from './handlers/autoReplyHandler.js';
import { TimingHandler } from './handlers/timingHandler.js';

export class DanmuBot extends EventEmitter {
  constructor() {
    super();
    this._config = loadConfig();
    this._cookies = null;
    this._selfUid = null;
    this._ws = null;
    this._sender = null;
    this._handlers = {};
    this._isLive = false;
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
    this._syncTimingToLiveState();
    return this._config;
  }

  /** 指定功能是否允许在当前直播状态下响应 */
  _shouldHandle(section) {
    return !this._config[section]?.onlyWhenLive || this._isLive;
  }

  /** 根据 timing.onlyWhenLive + 当前直播状态同步定时任务 */
  _syncTimingToLiveState() {
    if (!this._handlers.timing) return;
    if (!this._config.timing?.onlyWhenLive) {
      this._handlers.timing.restart();
    } else if (this._isLive) {
      this._handlers.timing.start();
    } else {
      this._handlers.timing.stop();
    }
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
      // 根据初始直播状态决定是否启动定时任务
      this._isLive = this._ws.liveStatus === 1;
      this._syncTimingToLiveState();
      console.log(`[Bot] 初始直播状态: ${this._isLive ? '直播中' : '未开播'}`);
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

    this._ws.onDanmaku = (e) => {
      if (this._shouldHandle('autoReply')) this._handlers.autoReply.handle(e);
      this.emit('message', { type: 'danmaku', ...e, ts: Date.now() });
    };
    this._ws.onGift = (e) => {
      if (this._shouldHandle('gift')) this._handlers.gift.handle(e);
      this.emit('message', { type: 'gift', ...e, ts: Date.now() });
    };
    this._ws.onGuard = (e) => {
      this.emit('message', { type: 'guard', ...e, ts: Date.now() });
    };
    this._ws.onEnter = (e) => {
      if (this._shouldHandle('enter')) this._handlers.enter.handle(e);
      this.emit('message', { type: 'enter', ...e, ts: Date.now() });
    };
    this._ws.onShare = (e) => {
      if (this._shouldHandle('share')) this._handlers.share.handle(e);
      this.emit('message', { type: 'share', ...e, ts: Date.now() });
    };
    this._ws.onLiveStatus = ({ isLive }) => {
      this._isLive = isLive;
      console.log(`[Bot] 直播状态变更: ${isLive ? '开播' : '下播'}`);
      this._syncTimingToLiveState();
      this.emit('message', { type: 'live', isLive, ts: Date.now() });
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
      isLive: this._isLive,
    };
  }
}
