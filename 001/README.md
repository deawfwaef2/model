# 【001】ZOMBIE RUSH 3D · 尸潮狂奔 3D

> 第三人称 3D 自动跑酷 + 360° 全向射击 + 丧尸围城。
> Three.js r159 · 全程序化美术 · 全合成音频 · 零外部资源 · 可 `file://` 双击直玩。

---

## 🎮 立即游玩

下载本文件夹 → 双击 **`game/index.html`**（或对应发行包里的 `index.html`）→ 点 **PLAY**。
不需要服务器、不需要联网、不需要安装任何东西。

---

## 📁 目录

```
001/
├── game/                  ← 主线源码（单一真源 · 无平台 SDK · 可直接玩）
│   ├── index.html
│   ├── lib/three.min.js   (656 KB)
│   └── js/
│       ├── audio.js       程序化音频引擎（BGM + 25 种音效）
│       ├── ads.js         广告适配层（本地模拟实现）
│       └── game.js        游戏主体
├── packages/
│   ├── crazygames/        ← 发行包 A：接入 CrazyGames SDK v3
│   └── playgama/          ← 发行包 B：接入 Playgama Bridge SDK
├── releases/              ← 打包好的 .zip（上传用）
└── tools/build.sh         ← 一键重建两个发行包 + zip
```

**改代码只改 `game/`**，然后运行 `bash 001/tools/build.sh` 重新生成两个包。

---

## 🕹 玩法

| 操作 | PC | 手机 |
|------|----|------|
| 瞄准 / 射击方向 | 鼠标移动（自动开火） | 手指拖动（自动开火） |
| 左右闪避 | A / D 或 ← → ，或直接跟随准心 | 手指位置带动走位 |
| 暂停 | ESC / P | 右上角 ⏸ |

- 主角**自动向前狂奔**，你只管指方向。
- 路边会漂浮**发光补给舱**（左右各一个，二选一）：把它的血条打空就能拿到里面的升级。
- 连杀会累积 **COMBO**，连击播报 + 分数倍率。
- **每 5 关**是 Boss 关：THE DEVOURER（冲锋 / 砸地冲击波 / 召唤小怪 / 三连吐酸）。

## 🧟 敌人

| 类型 | 特征 |
|------|------|
| Walker 行尸 | 基础，成群 |
| Runner 疾行者 | 高速冲刺 |
| Crawler 爬行者 | 矮小、之字形走位、难打 |
| Spitter 喷吐者 | 保持距离发射酸弹 |
| Bomber 爆裂者 | 贴身自爆，也可远程引爆做AOE |
| Brute 暴君 | 高血量、高伤害、抗击退 |
| **THE DEVOURER** | Boss，四段 AI |

## 🎁 场内 Buff（补给舱）

DAMAGE +30% · FIRE RATE +25% · MULTI-SHOT +1 · PIERCING · HOMING ROUNDS ·
SHIELD +1 · MEDKIT +40HP · CRYO BLAST（全场冰冻） · AIRSTRIKE（清屏） · COIN CACHE

## 🛠 商店永久升级（金币购买，跨局保留）

VITALITY 生命 · FIREPOWER 火力 · RAPID FIRE 射速 · HEADHUNTER 暴击 ·
MAGNETIZE 拾取范围 · NANO ARMOR 初始护盾 · SCAVENGER 金币加成

---

## 💰 广告位一览（共 7 处）

| # | 位置 | 类型 | 触发 |
|---|------|------|------|
| 1 | 主菜单底部 | 静态横幅 Banner | 进入菜单自动 |
| 2 | 商店底部 | 静态横幅 Banner | 进入商店自动 |
| 3 | 结算页底部 | 静态横幅 Banner | 通关/死亡结算 |
| 4 | 通关结算 | **激励视频** | 「2× COINS」金币翻倍 |
| 5 | 死亡界面 | **激励视频** | 「REVIVE」原地复活 |
| 6 | 关卡开始前 | **激励视频** | 「2× DAMAGE」本关双倍伤害 |
| 7 | 商店 | **激励视频** | 「FREE +250 🪙」白嫖金币 |
| 8 | 关卡切换 | **插屏 Interstitial** | 每 3 关一次 / 重试时 50% 概率 |

所有广告调用都走 `js/ads.js` 的统一接口，**SDK 加载失败会自动降级**为本地模拟，绝不卡死。

---

## 🔊 音频版权说明（重要）

**本作全部 BGM 与音效均为 Web Audio API 实时合成的原创内容，不含任何第三方采样。**
- ✅ 100% 可商用，无需署名，无授权风险（CrazyGames / Playgama 审核可直接过）
- ✅ 占用 **0 字节** 包体
- ✅ 自适应分层配乐：`pad 基础层 → 鼓组 → 贝斯/琶音战斗层 → 主音高压层`，
  随场上敌人密度实时混音；Boss 战自动切到 164 BPM 的三全音紧张进行。

---

## 📦 包体

| 项 | 大小 |
|----|------|
| three.min.js | ~656 KB |
| 游戏代码 (js+html) | ~120 KB |
| 音频 / 贴图 / 模型 | **0 KB**（全部运行时生成） |
| **单包合计** | **< 1 MB** ✅（要求 ≤ 20MB） |

---

## ✅ 进度

- [x] M1 核心可玩：跑 / 瞄 / 射 / 丧尸 / 补给舱 / HUD / 主菜单 / 关卡 / Boss / 商店 / 结算
- [x] M2 两个发行包（CrazyGames / Playgama）+ zip
- [ ] M3 按用户反馈迭代

---

# 📦 本编号下的第二款游戏：《TITAN LOOP 十秒轮回·弑神》

> 目录：[`titan-loop/`](titan-loop/) · 详细说明见 [`titan-loop/README.md`](titan-loop/README.md)
>
> 用户后续给出了具体到玩法层面的新规格（10 秒一关 / 主角站桩 / 鼠标即枪口 / 五列场地 /
> BOSS 带压迫感逼近），与《ZOMBIE RUSH 3D》不是同一个东西，因此**并列新增**，
> 上面那一款**原封不动保留**。

**一句话**：你只有 10 秒。泰坦从地平线走向你，它走到你面前的那一刻，就是第 10 秒 —— 
**它的位置就是倒计时**。你站着不能动，鼠标指哪打哪，10 秒内决定把子弹分给哪一列。

| 列 | 内容 | 打它的收益 |
|----|------|-----------|
| 1 | 前哨杂兵 | 不打就会撞上来削你的护盾 |
| 2 | 增幅塔 | 本局立刻变强，越早打复利越高 |
| 3 | 轮回核 | 永久碎片，**输了也保留** —— 这就是"轮回" |
| 4 | 守卫 / 裂隙 | 护盾板在转，要等它转开；裂隙会一直刷怪 |
| 5 | **泰坦** | 唯一的胜利条件 |

**立刻试玩**：下载 [`titan-loop/packages/standalone/index.html`](titan-loop/packages/standalone/index.html) 双击即可（单文件、离线、无需服务器）。

**两个发行包**
- CrazyGames：`titan-loop/packages/crazygames/` · `titan-loop/releases/titan-loop-crazygames.zip`
- Playgama：`titan-loop/packages/playgama/` · `titan-loop/releases/titan-loop-playgama.zip`

**构建 / 测试**
```bash
node 001/titan-loop/tools/smoketest.js   # 无头跑完整战斗循环 + 数值平衡体检
node 001/titan-loop/tools/build.js       # 生成 3 个包 + zip
```
