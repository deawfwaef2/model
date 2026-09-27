/* ==========================================================================
   TITAN LOOP — 00_core.js
   基础设施：数学工具 / 随机 / 存档 / 国际化 / 设备检测 / 事件总线
   ========================================================================== */
(function (root) {
  'use strict';

  var TL = root.TL = root.TL || {};

  /* ----------------------------- 数学工具 ----------------------------- */
  var M = TL.M = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    // 帧率无关的指数插值
    damp: function (a, b, lambda, dt) { return M.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    inv: function (v, a, b) { return b === a ? 0 : (v - a) / (b - a); },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle: function (arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
    easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    easeOutBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    easeInQuad: function (t) { return t * t; },
    easeOutElastic: function (t) {
      var c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }
  };

  /* --------------------- 确定性随机（关卡布局用） --------------------- */
  // mulberry32：同一关卡号永远生成同样的布局，玩家可以"背板"提升成绩
  TL.seeded = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------ 事件总线 ---------------------------- */
  var handlers = {};
  TL.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  TL.emit = function (name, payload) {
    var hs = handlers[name]; if (!hs) return;
    for (var i = 0; i < hs.length; i++) { try { hs[i](payload); } catch (e) { console.warn('[TL event]', name, e); } }
  };

  /* ------------------------------ 设备检测 ---------------------------- */
  var ua = (root.navigator && root.navigator.userAgent) || '';
  var DEV = TL.DEV = {
    touch: ('ontouchstart' in root) || (root.navigator && root.navigator.maxTouchPoints > 0),
    mobile: /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua),
    ios: /iPad|iPhone|iPod/.test(ua),
    lowEnd: false,
    reducedMotion: !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)
  };
  DEV.lowEnd = DEV.mobile && ((root.navigator && root.navigator.hardwareConcurrency || 4) <= 4);

  TL.vibrate = function (pattern) {
    if (!TL.save.data.settings.haptics) return;
    if (root.navigator && root.navigator.vibrate) { try { root.navigator.vibrate(pattern); } catch (e) {} }
  };

  /* -------------------------------- 存档 ------------------------------ */
  var SAVE_KEY = 'titanloop.save.v1';

  function defaultSave() {
    return {
      v: 1,
      coins: 0,
      shards: 0,          // 轮回碎片（永久升级货币）
      levelReached: 1,    // 已解锁到第几关
      stars: {},          // { "3": 2 } 关卡 -> 星数
      best: {},           // { "3": 4.21 } 关卡 -> 最佳用时
      upgrades: {},       // { dmg: 3, rate: 1, ... }
      ownedWeapons: ['pulse'],
      weapon: 'pulse',
      totalKills: 0,
      totalLoops: 0,
      totalPlaySec: 0,
      lastDaily: 0,
      dailyStreak: 0,
      freeChestAt: 0,
      seenTutorial: false,
      settings: { music: true, sfx: true, haptics: true, quality: 'auto', lang: null }
    };
  }

  var save = TL.save = {
    data: defaultSave(),
    _dirty: false,
    _t: 0,
    load: function () {
      try {
        var raw = root.localStorage && root.localStorage.getItem(SAVE_KEY);
        if (raw) {
          var obj = JSON.parse(raw);
          if (obj && obj.v === 1) {
            var d = defaultSave();
            for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) d[k] = obj[k];
            // settings 要逐字段合并，避免旧档缺字段
            var s = defaultSave().settings;
            for (var sk in s) if (!(sk in (d.settings || {}))) { d.settings = d.settings || {}; d.settings[sk] = s[sk]; }
            save.data = d;
          }
        }
      } catch (e) { console.warn('[save] load failed', e); }
      return save.data;
    },
    flush: function () {
      try { root.localStorage && root.localStorage.setItem(SAVE_KEY, JSON.stringify(save.data)); }
      catch (e) { /* 隐身模式等，静默失败 */ }
      save._dirty = false;
    },
    // 节流写入，避免每帧 IO
    mark: function () { save._dirty = true; },
    tick: function (dt) {
      if (!save._dirty) return;
      save._t += dt;
      if (save._t > 0.7) { save._t = 0; save.flush(); }
    },
    reset: function () { save.data = defaultSave(); save.flush(); }
  };
  root.addEventListener && root.addEventListener('pagehide', function () { if (save._dirty) save.flush(); });
  root.addEventListener && root.addEventListener('blur', function () { if (save._dirty) save.flush(); });

  /* ------------------------------ 国际化 ------------------------------ */
  var STR = {
    zh: {
      tagline: '十秒轮回 · 弑神',
      play: '开始游戏', continue: '继续征战', levels: '关卡', shop: '商店', lab: '轮回实验室',
      settings: '设置', credits: '制作', back: '返回', close: '关闭',
      level: '关卡', loop: '轮回', coins: '金币', shards: '碎片',
      tapToStart: '点击任意处开始', loading: '正在唤醒泰坦…',
      ready: '准备', go: '开火！',
      victory: '泰坦已陨落', defeat: '轮回', timeUp: '时间耗尽',
      crushed: '被泰坦碾碎',
      clearTime: '通关用时', bestTime: '最佳', newBest: '新纪录！',
      rewardX2: '看广告 ×2 金币', claimed: '已领取',
      retry: '再来一次', next: '下一关', menu: '主菜单',
      revive: '看广告 +3 秒续命', reviveUsed: '本局已用过',
      amps: '增幅', ampGot: '增幅获得',
      shardsGot: '碎片 +',
      combo: '连击', par: '标准用时',
      startBonus: '看广告获得开局增幅', startBonusGot: '开局增幅已装备',
      upgrade: '升级', maxed: '已满级', cost: '花费', buy: '购买', owned: '已拥有', equip: '装备', equipped: '已装备',
      notEnough: '资源不足',
      freeChest: '免费宝箱', freeChestIn: '冷却中',
      daily: '每日奖励', dailyStreak: '连续登录',
      music: '音乐', sfx: '音效', haptics: '震动', quality: '画质', language: '语言',
      qualityAuto: '自动', qualityLow: '流畅', qualityHigh: '高清',
      resetSave: '清空存档', resetConfirm: '确定清空全部进度？不可恢复！',
      howto: '玩法', locked: '未解锁',
      act1: '熔核废墟', act2: '霜蚀深渊', act3: '虚空王庭',
      hintAim: '移动鼠标瞄准，自动开火', hintAimTouch: '按住屏幕瞄准，自动开火',
      hintAmp: '金色 = 增幅，本局变强', hintCore: '紫色 = 轮回核，永久变强',
      hintTitan: '泰坦走到你面前 = 你输',
      stat_dmg: '伤害', stat_rate: '射速', stat_crit: '暴击', stat_hp: '护盾',
      stat_time: '时限', stat_magnet: '吸金', stat_start: '开局增幅', stat_pierce: '穿透',
      up_dmg: '弹头强化', up_rate: '超频枪机', up_crit: '致命校准', up_hp: '相位护盾',
      up_time: '时间延展', up_magnet: '引力吸金', up_start: '预载增幅', up_pierce: '穿甲弹芯',
      up_dmg_d: '每级 +12% 基础伤害', up_rate_d: '每级 +8% 射速',
      up_crit_d: '每级 +4% 暴击率（暴击 2.5 倍）', up_hp_d: '每级 +25 点护盾',
      up_time_d: '每级 +0.35 秒时限', up_magnet_d: '每级 +25% 拾取范围',
      up_start_d: '每级开局多带 1 个随机增幅', up_pierce_d: '每级子弹多穿透 1 个目标',
      weapons: '武器', boosters: '道具',
      pause: '暂停', resume: '继续', quit: '放弃本局',
      starsTotal: '总星数', killsTotal: '累计击杀', loopsTotal: '轮回次数',
      allClear: '全部关卡已通关！', more: '更多关卡制作中…',
      adLoading: '广告加载中…', adFailed: '广告暂不可用',
      shieldBreak: '护盾破碎！', overload: '过载！', perfect: '完美！',
      chestGot: '获得', tutorialTitle: '10 秒 · 弑神指南', gotIt: '我懂了，开打',
      bossIncoming: '泰坦逼近', dps: '秒伤'
    },
    en: {
      tagline: 'TEN SECONDS TO KILL A GOD',
      play: 'PLAY', continue: 'CONTINUE', levels: 'LEVELS', shop: 'SHOP', lab: 'LOOP LAB',
      settings: 'SETTINGS', credits: 'CREDITS', back: 'BACK', close: 'CLOSE',
      level: 'LEVEL', loop: 'LOOP', coins: 'COINS', shards: 'SHARDS',
      tapToStart: 'TAP ANYWHERE TO START', loading: 'WAKING THE TITAN…',
      ready: 'READY', go: 'FIRE!',
      victory: 'TITAN SLAIN', defeat: 'LOOPED', timeUp: 'OUT OF TIME',
      crushed: 'CRUSHED BY THE TITAN',
      clearTime: 'CLEAR TIME', bestTime: 'BEST', newBest: 'NEW RECORD!',
      rewardX2: 'WATCH AD — 2× COINS', claimed: 'CLAIMED',
      retry: 'RETRY', next: 'NEXT LEVEL', menu: 'MENU',
      revive: 'WATCH AD — +3 SECONDS', reviveUsed: 'ALREADY USED',
      amps: 'AMPS', ampGot: 'AMP ACQUIRED',
      shardsGot: 'SHARDS +',
      combo: 'COMBO', par: 'PAR',
      startBonus: 'WATCH AD — FREE STARTING AMP', startBonusGot: 'STARTING AMP EQUIPPED',
      upgrade: 'UPGRADE', maxed: 'MAX', cost: 'COST', buy: 'BUY', owned: 'OWNED', equip: 'EQUIP', equipped: 'EQUIPPED',
      notEnough: 'NOT ENOUGH',
      freeChest: 'FREE CHEST', freeChestIn: 'COOLDOWN',
      daily: 'DAILY BONUS', dailyStreak: 'STREAK',
      music: 'MUSIC', sfx: 'SFX', haptics: 'HAPTICS', quality: 'QUALITY', language: 'LANGUAGE',
      qualityAuto: 'AUTO', qualityLow: 'FAST', qualityHigh: 'HIGH',
      resetSave: 'WIPE SAVE', resetConfirm: 'Erase ALL progress? This cannot be undone!',
      howto: 'HOW TO PLAY', locked: 'LOCKED',
      act1: 'CRIMSON FOUNDRY', act2: 'GLACIAL ABYSS', act3: 'VOID COURT',
      hintAim: 'Move mouse to aim — you fire automatically', hintAimTouch: 'Hold the screen to aim — you fire automatically',
      hintAmp: 'GOLD = Amplifier, stronger THIS run', hintCore: 'PURPLE = Loop Core, stronger FOREVER',
      hintTitan: 'If the Titan reaches you, you lose',
      stat_dmg: 'DMG', stat_rate: 'RATE', stat_crit: 'CRIT', stat_hp: 'SHIELD',
      stat_time: 'TIME', stat_magnet: 'MAGNET', stat_start: 'HEADSTART', stat_pierce: 'PIERCE',
      up_dmg: 'WARHEAD', up_rate: 'OVERCLOCK', up_crit: 'LETHAL TUNING', up_hp: 'PHASE SHIELD',
      up_time: 'TIME DILATION', up_magnet: 'GRAVITY PURSE', up_start: 'PRELOADED AMP', up_pierce: 'SABOT CORE',
      up_dmg_d: '+12% base damage per level', up_rate_d: '+8% fire rate per level',
      up_crit_d: '+4% crit chance per level (2.5× dmg)', up_hp_d: '+25 shield per level',
      up_time_d: '+0.35s time limit per level', up_magnet_d: '+25% pickup range per level',
      up_start_d: 'Start each run with +1 random Amp', up_pierce_d: 'Bullets pierce +1 target per level',
      weapons: 'WEAPONS', boosters: 'BOOSTERS',
      pause: 'PAUSED', resume: 'RESUME', quit: 'ABANDON RUN',
      starsTotal: 'STARS', killsTotal: 'KILLS', loopsTotal: 'LOOPS',
      allClear: 'ALL LEVELS CLEARED!', more: 'More levels coming soon…',
      adLoading: 'LOADING AD…', adFailed: 'AD UNAVAILABLE',
      shieldBreak: 'SHIELD BROKEN!', overload: 'OVERLOAD!', perfect: 'PERFECT!',
      chestGot: 'YOU GOT', tutorialTitle: '10 SECONDS · GODKILL BRIEFING', gotIt: 'GOT IT — LET ME AT IT',
      bossIncoming: 'TITAN INBOUND', dps: 'DPS'
    }
  };

  TL.lang = 'en';
  TL.setLang = function (l) {
    TL.lang = STR[l] ? l : 'en';
    save.data.settings.lang = TL.lang; save.mark();
    TL.emit('lang', TL.lang);
  };
  TL.t = function (k) { var s = STR[TL.lang] || STR.en; return (k in s) ? s[k] : (STR.en[k] !== undefined ? STR.en[k] : k); };
  TL.detectLang = function () {
    if (save.data.settings.lang) return save.data.settings.lang;
    var n = (root.navigator && (root.navigator.language || root.navigator.userLanguage) || 'en').toLowerCase();
    return n.indexOf('zh') === 0 ? 'zh' : 'en';
  };

  /* ---------------------------- 数字格式化 ---------------------------- */
  TL.fmt = function (n) {
    n = Math.floor(n);
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return '' + n;
  };
  TL.fmtTime = function (s) { return (Math.max(0, s)).toFixed(2) + 's'; };

  /* ------------------------------ 版本号 ------------------------------ */
  TL.VERSION = '1.0.0';
  TL.BUILD = '__BUILD_TAG__';

})(typeof window !== 'undefined' ? window : this);
