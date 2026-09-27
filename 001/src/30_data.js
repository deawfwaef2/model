/* ==========================================================================
   TITAN LOOP — 30_data.js
   数据表：增幅、永久升级、武器、关卡生成、星级 par 计算、主题配色
   ========================================================================== */
(function (root) {
  'use strict';
  var TL = root.TL = root.TL || {};
  var M = TL.M;

  /* ============================ 主题 / 幕 ============================ */
  TL.ACTS = [
    {
      id: 0, key: 'act1',
      sky: 0x1a0708, fog: 0x2b0d0a, ground: 0x2a1113, grid: 0xff5a2a,
      rim: 0xff6b2c, enemy: 0xff3b1e, titan: 0xff4a14, accent: '#ff6b2c',
      accent2: '#ffb347', particles: 0xff8844
    },
    {
      id: 1, key: 'act2',
      sky: 0x03121c, fog: 0x062634, ground: 0x0a2230, grid: 0x28d8ff,
      rim: 0x46e0ff, enemy: 0x2fb8ff, titan: 0x18e2ff, accent: '#3ddcff',
      accent2: '#b6f4ff', particles: 0x66e8ff
    },
    {
      id: 2, key: 'act3',
      sky: 0x0d0418, fog: 0x1b0a2e, ground: 0x180a28, grid: 0xb445ff,
      rim: 0xd06bff, enemy: 0xc03bff, titan: 0xe23bff, accent: '#c86bff',
      accent2: '#ff9de0', particles: 0xcc77ff
    }
  ];
  TL.actOf = function (level) { return level <= 10 ? 0 : level <= 20 ? 1 : 2; };

  /* ============================== 增幅 =============================== */
  // 本局生效，打碎 C2 增幅塔获得。越早打越赚 —— 这是核心决策。
  TL.AMPS = [
    { id: 'rapid', icon: '⚡', zh: '超频', en: 'RAPID', zhd: '射速 +45%', end: '+45% fire rate', w: 10, apply: function (s) { s.rate *= 1.45; } },
    { id: 'heavy', icon: '💥', zh: '重弹', en: 'HEAVY', zhd: '伤害 +65%', end: '+65% damage', w: 10, apply: function (s) { s.dmg *= 1.65; } },
    { id: 'split', icon: '✳', zh: '分裂', en: 'SPLIT', zhd: '多 1 发弹道', end: '+1 projectile', w: 8, apply: function (s) { s.shots += 1; s.dmg *= 0.82; s.spread = Math.max(s.spread, 0.7); } },
    { id: 'pierce', icon: '➤', zh: '穿透', en: 'PIERCE', zhd: '多穿透 2 个目标', end: 'Pierce +2 targets', w: 8, apply: function (s) { s.pierce += 2; } },
    { id: 'burn', icon: '🔥', zh: '灼烧', en: 'BURN', zhd: '命中附加持续伤害', end: 'Hits apply burn DoT', w: 7, apply: function (s) { s.burn += 1; } },
    { id: 'chrono', icon: '⧗', zh: '时滞', en: 'CHRONO', zhd: '泰坦减速，+1.4 秒', end: 'Slow the Titan, +1.4s', w: 6, apply: function (s) { s.timeBonus += 1.4; } },
    { id: 'crit', icon: '✦', zh: '致命', en: 'LETHAL', zhd: '暴击率 +22%', end: '+22% crit chance', w: 8, apply: function (s) { s.crit += 0.22; } },
    { id: 'ward', icon: '◈', zh: '护盾', en: 'WARD', zhd: '护盾 +60，清空周围敌人', end: '+60 shield, clears nearby', w: 7, apply: function (s) { s.shield += 60; s.nova = true; } },
    { id: 'greed', icon: '⬤', zh: '贪婪', en: 'GREED', zhd: '本关金币 +120%', end: '+120% coins this level', w: 7, apply: function (s) { s.coinMul += 1.2; } },
    { id: 'chain', icon: '⌁', zh: '链电', en: 'CHAIN', zhd: '命中溅射到附近敌人', end: 'Hits chain to nearby foes', w: 6, apply: function (s) { s.chain += 1; } },
    { id: 'siege', icon: '☠', zh: '攻坚', en: 'SIEGE', zhd: '对泰坦伤害 +90%', end: '+90% damage to Titan', w: 6, apply: function (s) { s.bossMul += 0.9; } },
    { id: 'echo', icon: '◎', zh: '回响', en: 'ECHO', zhd: '每次击杀回复 0.12 秒', end: 'Each kill refunds 0.12s', w: 5, apply: function (s) { s.killRefund += 0.12; } }
  ];
  TL.ampById = function (id) { for (var i = 0; i < TL.AMPS.length; i++) if (TL.AMPS[i].id === id) return TL.AMPS[i]; return null; };
  TL.ampName = function (a) { return TL.lang === 'zh' ? a.zh : a.en; };
  TL.ampDesc = function (a) { return TL.lang === 'zh' ? a.zhd : a.end; };

  TL.rollAmps = function (rng, n) {
    var pool = [], i, j;
    for (i = 0; i < TL.AMPS.length; i++) for (j = 0; j < TL.AMPS[i].w; j++) pool.push(TL.AMPS[i]);
    var out = [], used = {};
    var guard = 0;
    while (out.length < n && guard++ < 400) {
      var a = pool[Math.floor(rng() * pool.length)];
      if (used[a.id]) continue;
      used[a.id] = 1; out.push(a);
    }
    return out;
  };

  /* ========================= 永久升级（碎片） ========================= */
  TL.UPGRADES = [
    { id: 'dmg',    icon: '◆', max: 12, base: 3,  grow: 1.42 },
    { id: 'rate',   icon: '⚡', max: 12, base: 3,  grow: 1.42 },
    { id: 'crit',   icon: '✦', max: 10, base: 4,  grow: 1.46 },
    { id: 'hp',     icon: '◈', max: 10, base: 3,  grow: 1.40 },
    { id: 'time',   icon: '⧗', max: 8,  base: 7,  grow: 1.62 },
    { id: 'pierce', icon: '➤', max: 6,  base: 8,  grow: 1.70 },
    { id: 'magnet', icon: '⬤', max: 6,  base: 3,  grow: 1.40 },
    { id: 'start',  icon: '★', max: 4,  base: 20, grow: 1.95 }
  ];
  TL.upCost = function (u, lvl) { return Math.round(u.base * Math.pow(u.grow, lvl)); };
  TL.upLevel = function (id) { return TL.save.data.upgrades[id] || 0; };

  /* ============================== 武器 =============================== */
  TL.WEAPONS = [
    {
      id: 'pulse', cost: 0, icon: '◈', zh: '脉冲步枪', en: 'PULSE RIFLE',
      zhd: '均衡的起手武器 · 75 DPS', end: 'Balanced all-rounder · 75 DPS',
      dmg: 10, rate: 7.5, shots: 1, spread: 0.30, speed: 105, color: 0x66e0ff
    },
    {
      id: 'shred', cost: 850, icon: '⁂', zh: '碎裂霰弹', en: 'SHREDDER',
      zhd: '5 发扇形 · 近列清场之王 · 119 DPS', end: '5-pellet spread · lane-clearing king · 119 DPS',
      dmg: 7.0, rate: 3.4, shots: 5, spread: 2.10, speed: 92, color: 0xffb03a
    },
    {
      id: 'lance', cost: 1700, icon: '↑', zh: '穿甲长矛', en: 'RAIL LANCE',
      zhd: '慢速高伤 · 天生穿透 4 · 124 DPS', end: 'Slow heavy hits · pierces 4 · 124 DPS',
      dmg: 62, rate: 2.0, shots: 1, spread: 0.06, speed: 200, pierce: 4, color: 0xff4fd2
    },
    {
      id: 'storm', cost: 3100, icon: '⌁', zh: '风暴机枪', en: 'STORMGUN',
      zhd: '疯狂射速 · 散布较大 · 141 DPS', end: 'Insane fire rate · wide spread · 141 DPS',
      dmg: 6.4, rate: 22, shots: 1, spread: 0.95, speed: 130, color: 0x9dff4f
    },
    {
      id: 'void', cost: 5200, icon: '◉', zh: '虚空喷流', en: 'VOID STREAM',
      zhd: '双发追踪 + 链电 · 190 DPS', end: 'Twin homing bolts + chain · 190 DPS',
      dmg: 9.5, rate: 10, shots: 2, spread: 0.55, speed: 104, chain: 1, homing: 1, color: 0xc86bff
    }
  ];
  TL.weaponById = function (id) { for (var i = 0; i < TL.WEAPONS.length; i++) if (TL.WEAPONS[i].id === id) return TL.WEAPONS[i]; return TL.WEAPONS[0]; };
  TL.wName = function (w) { return TL.lang === 'zh' ? w.zh : w.en; };
  TL.wDesc = function (w) { return TL.lang === 'zh' ? w.zhd : w.end; };

  /* =========================== 玩家属性结算 =========================== */
  TL.baseStats = function () {
    var s = TL.save.data, w = TL.weaponById(s.weapon);
    var st = {
      dmg: w.dmg * (1 + 0.12 * TL.upLevel('dmg')),
      rate: w.rate * (1 + 0.08 * TL.upLevel('rate')),
      shots: w.shots,
      spread: w.spread,
      speed: w.speed,
      pierce: (w.pierce || 0) + TL.upLevel('pierce'),
      crit: 0.04 * TL.upLevel('crit'),
      critMul: 2.5,
      shield: 100 + 25 * TL.upLevel('hp'),
      timeBonus: 0.35 * TL.upLevel('time'),
      magnet: 1 + 0.25 * TL.upLevel('magnet'),
      startAmps: TL.upLevel('start'),
      burn: 0, chain: w.chain || 0, homing: w.homing || 0,
      coinMul: 1, bossMul: 0, killRefund: 0, nova: false,
      color: w.color
    };
    return st;
  };

  /* ============================ 关卡生成 ============================= */
  // 30 关，3 幕。确定性生成：同一关永远一样，玩家可以背板刷时间。
  TL.LEVEL_COUNT = 30;

  /**
   * 期望战力曲线：一个"正常进度"的玩家在第 n 关时相对裸装脉冲步枪的倍率。
   * 血量由它反推 —— 这样 par（标准用时）就是真正的设计目标，而不是猜出来的。
   */
  TL.BASE_DPS = 75;                                   // 脉冲步枪裸装 DPS
  // 武器带来的战力用平滑曲线，避免"刚好没买到下一把枪"时出现难度断崖
  TL.refPower = function (n) {
    var wMul = 1 + 1.5 * Math.pow(Math.min(1, (n - 1) / 29), 1.1);
    var up = Math.min(12, (n - 1) * 0.42);            // 预期永久升级等级
    var upMul = (1 + 0.12 * up) * (1 + 0.08 * up) * (1 + 0.04 * Math.min(10, up) * 1.5);
    var ampMul = 1.35 + Math.min(1.00, n * 0.038);    // 本局预期吃到的增幅收益
    return wMul * upMul * ampMul;
  };
  /** 标准用时：玩家应该花多久通关（星级以此为基准） */
  TL.parFor = function (n, isBoss, isElite) {
    return 3.3 + Math.min(2.9, (n - 1) * 0.11) + (isBoss ? 1.1 : 0) + (isElite ? 0.4 : 0);
  };

  TL.levelDef = function (n) {
    var rng = TL.seeded(1337 + n * 7919);
    var act = TL.actOf(n);
    var isBoss = (n % 10 === 0);
    var isElite = (n % 5 === 0) && !isBoss;

    var timeLimit = 10;
    var armor = n < 3 ? 0 : Math.min(0.28, 0.032 * Math.floor((n - 2) / 2));

    // —— 后期机制
    var mech = {
      shieldPhase: n >= 8 && (isBoss || n % 4 === 0),   // 泰坦护盾，必须先破盾
      rift: n >= 12,                                    // 裂隙持续刷小怪
      mirror: n >= 15 && n % 3 === 0,                   // 镜像增幅（负面陷阱）
      twin: isBoss && n >= 20,                          // 双泰坦
      regen: n >= 18 && n % 4 === 1,                    // 泰坦回血，逼你集火
      hasteGrunt: n >= 9
    };

    // —— 血量反推
    var par = TL.parFor(n, isBoss, isElite);
    var dps = TL.BASE_DPS * TL.refPower(n);
    // 打泰坦的时间占比：关卡越靠后，前 4 列要处理的东西越多，能砸在泰坦身上的时间越少。
    // 这个系数是拿 tools/smoketest.js 里的 AI 玩家实测标定出来的，不是拍脑袋。
    var uptime = 0.62 - Math.min(0.22, (n - 1) * 0.0075) - (isBoss ? 0.06 : isElite ? 0.02 : 0);
    var totalEff = dps * uptime * par;                  // 需要造成的有效伤害
    var totalHp = Math.round(totalEff / (1 - armor));
    var shieldHp = mech.shieldPhase ? Math.round(totalHp * 0.26) : 0;
    // 双泰坦：小泰坦血量 = 主泰坦的 45%，两者相加必须等于设计总量
    var twinMul = mech.twin ? 1.45 : 1;
    var hp = Math.round((totalHp - shieldHp) / twinMul);

    // —— 各列数量
    var gruntCount = Math.min(14, 2 + Math.floor(n * 0.55));
    var ampCount = n < 2 ? 2 : Math.min(5, 2 + Math.floor(n / 6));
    var coreCount = Math.min(4, 1 + Math.floor(n / 7));
    var wardenCount = n < 4 ? 0 : Math.min(4, Math.floor((n - 1) / 5));
    var amps = TL.rollAmps(rng, ampCount);

    return {
      n: n, act: act, isBoss: isBoss, isElite: isElite,
      hp: hp, armor: armor, shieldHp: shieldHp, timeLimit: timeLimit, totalHp: totalHp,
      gruntCount: gruntCount, ampCount: ampCount, coreCount: coreCount, wardenCount: wardenCount,
      amps: amps, mech: mech, par: par,
      coreValue: 3 + Math.floor(n / 3) + (isBoss ? 8 : 0),
      coinBase: 40 + n * 22 + (isBoss ? 260 : isElite ? 90 : 0),
      seed: 1337 + n * 7919
    };
  };

  TL.starsFor = function (def, time) {
    if (time <= def.par * 0.62) return 3;
    if (time <= def.par * 0.92) return 2;
    return 1;
  };

  TL.totalStars = function () {
    var s = TL.save.data.stars, t = 0;
    for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t += s[k];
    return t;
  };

  /* ============================ 商店道具 ============================= */
  TL.BOOSTERS = [
    { id: 'amp1', cost: 260, icon: '★', zh: '预载增幅 ×1', en: 'Preload Amp ×1', zhd: '下一关开局多带 1 个增幅', end: 'Next run starts with +1 Amp' },
    { id: 'time2', cost: 420, icon: '⧗', zh: '时间胶囊', en: 'Time Capsule', zhd: '下一关 +2 秒', end: '+2 seconds next run' },
    { id: 'shield', cost: 200, icon: '◈', zh: '强化护盾', en: 'Hard Shield', zhd: '下一关护盾 +120', end: '+120 shield next run' }
  ];

})(typeof window !== 'undefined' ? window : this);
