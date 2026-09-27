# HANDOFF — 给所有接手本仓库的 AI / 开发者

> **每次开始编程前，必须先完整读一遍这个文件。**
> **禁止覆盖/删除本文件。** 只能在文末 `## 变更日志` 追加，或在自己的子项目文件夹里写 `HANDOFF-00X.md` 补充。

---

## 0. 仓库结构约定（硬性）

```
/                       仓库根
├── HANDOFF.md          ← 本文件，所有人必读，禁止覆盖
├── 001/                ← 用户编号【001】的项目，所有产物放这里
│   ├── index.html      ← 开发/预览用，可直接双击运行
│   ├── src/            ← 源码（按 00_ 10_ 20_ 前缀排序拼接）
│   ├── vendor/         ← 第三方库（three.min.js，MIT）
│   ├── tools/build.js  ← 打包脚本，产出下面 3 个包
│   ├── build/
│   │   ├── standalone/ ← 单文件 HTML，双击即玩（给用户下载）
│   │   ├── crazygames/ ← 接入 CrazyGames SDK v3
│   │   └── playgama/   ← 接入 Playgama Bridge SDK
│   └── dist/*.zip      ← 上传用压缩包
└── 00X/                ← 未来其它编号项目，同样规则
```

**用户每次会给一个编号（如【001】）。必须在对应子文件夹里读取和保存；没有就新建。不要把文件散在根目录。**

---

## 1. 用户的硬性约束（违反 = 返工）

| # | 约束 | 说明 |
|---|------|------|
| 1 | **阶段性、高频 push 到 GitHub** | 不要全部做完才提交。每完成一个可玩增量就 `git add -A && git commit && git push`。用户那边的网站可能随时中断/回退。 |
| 2 | **HTML 包要最优先产出，不能最后打包** | 任何时刻中断，用户 clone 下来都必须能玩。所以：**先跑 `node 001/tools/build.js` 再 push**，保证 `build/` 里永远是最新可玩版本。 |
| 3 | **下载下来双击就能玩** | `build/standalone/index.html` 必须在 `file://` 协议下能跑。→ **禁止 ES Module / import / fetch / XHR 加载资源**。全部用经典 `<script>` 内联，资源用 DataURI 或程序化生成。 |
| 4 | **必须有"开始游戏"按钮** | 打开就是主菜单，有明显的大按钮可以点进去玩。不能是一打开就黑屏/需要控制台。 |
| 5 | **工作区 < 128MB** | 超了会随机丢文件。不要 `npm install`，不要下大资源包。当前占用见下方"体积账本"。 |
| 6 | **游戏成品 ≤ 20MB** | 目前 standalone 单文件约 0.9MB，余量充足。加资源前先算账。 |
| 7 | **电脑 + 手机都要能玩** | 鼠标 = 瞄准，触屏 = 瞄准；自适应分辨率；手机降画质；`navigator.vibrate` 震动反馈。 |
| 8 | **最终交付 2 个包** | ① CrazyGames 广告 SDK 版 ② Playgama 广告 SDK 版。两个包功能一致，只有广告适配层不同。 |
| 9 | **根据用户反馈迭代** | 用户反馈优先级最高，收到反馈先改反馈项，再继续原计划。 |
| 10 | **不要交半成品观感** | 要像完成品：有主题、有 BGM、有音效、有 UI 动画、有进度系统、有商店。 |

---

## 2. 用户的偏好（软约束，但很重要）

- **"反馈感要给足给爽"** —— 打击感是第一优先级。屏幕震动、命中停顿(hitstop)、粒子、伤害数字、闪光、音效层叠、连击播报、震动马达，宁可过火不要平淡。
- **"主题要劲爆抓眼球"** —— 玩家刷到缩略图就想点进来。
- **"我的 IDEA 很模糊，你要大师级细化"** —— 不要照抄字面需求，要补完成一个真正好玩的设计。可以改，只要抓住原意。
- **"要让玩家愿意反复玩"** —— 必须有 meta 进度（永久成长）、星级评价、商店、每日奖励。
- **"广告位给足，我要赚钱"** —— 但不能恶心到玩家流失。原则：**激励视频(玩家主动点)给到满，插屏(强制)克制**。
- 音效/音乐要**可商用、无版权风险**。见 §5。

---

## 3. 当前项目【001】= 《TITAN LOOP / 十秒轮回》

### 一句话
**你只有 10 秒。一尊神级泰坦正在向你走来。在它走到你面前之前杀死它 —— 或者死去、轮回、变得更强。**

### 核心玩法（已定稿，不要推翻）
- 第三人称 3D，**主角站桩不动**，鼠标/手指位置 = 射击方向，自动开火。
- 场地向右延伸，共 **5 列**：
  - **C1 前哨 (x≈10)**：普通敌军，冲向你、扣血。
  - **C2 增幅塔 (x≈17)**：金色，打碎 → 获得**本关**增益（叠加，越早打越赚）。
  - **C3 轮回核 (x≈24)**：紫色，打碎 → 获得**永久**货币"轮回碎片"，死后用来做永久升级。
  - **C4 守卫/裂隙 (x≈31)**：护盾精英 + 会刷小怪的裂隙，后期关卡的"决策位"。
  - **C5 泰坦 (x 从 44 → 4)**：BOSS，**它的位置就是计时器**，走到你面前 = 第 10 秒 = 你输。
- 输了 = 轮回，带着碎片变强再来。核心张力 = **10 秒内，子弹打哪儿**（当下伤害 vs 本局成长 vs 永久成长）。
- **星级 = 通关用时**：≤par×0.55 → 3★，≤par×0.80 → 2★，否则 1★。par 由关卡数据算出。

### 已实现 / 待办
见 `001/PROGRESS.md`（每次迭代都要更新）。

---

## 4. 技术约定

- **three.js r160 UMD**（`vendor/three.min.js`，MIT）。用全局 `THREE.*`，**不要**用 ES module 版。
- 源码在 `001/src/`，文件名带数字前缀决定拼接顺序。`tools/build.js` 会按顺序内联进单文件 HTML。
- 无构建依赖：只用 **Node 自带 API**（`fs`/`path`/`zlib`）。**不要 npm install**（体积 + 沙箱不持久）。
- 渲染性能：`pixelRatio` 上限 1.5（手机 1.0），无后处理，辉光用叠加面片假装；对象池化（子弹/粒子/伤害数字）。
- 存档：`localStorage`，key = `titanloop.save.v1`。平台 SDK 有云存档时优先走 SDK。

### 打包命令
```bash
node 001/tools/build.js          # 产出 standalone / crazygames / playgama + zip
```
**每次 push 前都要跑一次。**

---

## 5. 音频策略（重要，别改成下载音频文件）

用户要求"音乐音效可商用、大师级反馈"。本项目采用 **100% 程序化合成（Web Audio API 实时合成）**，理由：

1. **零版权风险** —— 不是任何人的录音/作曲，是代码实时生成的波形，商用完全干净（CrazyGames / Playgama 审核不会卡）。
2. **零体积** —— 几 KB 代码换一整套自适应 BGM + 30 种音效，帮我们守住 20MB 红线。
3. **file:// 可用** —— 不需要 fetch 音频文件，双击就能响。
4. **自适应** —— BGM 分层（鼓 / 贝斯 / 琶音 / Pad / 紧张层），根据剩余时间和战况实时加减层，比固定音轨更有临场感。

细节见 `001/AUDIO_LICENSE.md`。若将来真要换成外部音源，**只允许 CC0 / Public Domain**，并在该文件登记来源与许可证。

---

## 6. 广告接入（两个包的唯一差异）

统一走 `src/20_ads.js` 的 `Ads` 抽象层，游戏逻辑只调 `Ads.rewarded(placement, onReward)` / `Ads.interstitial(placement)` / `Ads.banner(...)`。
构建时注入不同 provider：

**CrazyGames v3** — `https://sdk.crazygames.com/crazygames-sdk-v3.js`
- `window.CrazyGames.SDK.ad.requestAd('rewarded'|'midgame', {adStarted, adFinished, adError})`
- 必须：`game.loadingStart/loadingStop`、`game.gameplayStart/gameplayStop` 包住实际游玩、广告期间**静音**、`game.happytime()` 在高光时刻。
- 横幅：`SDK.banner.requestBanner({id, width, height})`。

**Playgama Bridge** — `https://bridge.playgama.com/v1/stable/playgama-bridge.js`
- `bridge.initialize()` → `bridge.advertisement.showRewarded(placement)` / `showInterstitial(placement)` / `showBanner(position, placement)`
- 监听 `bridge.EVENT_NAME.REWARDED_STATE_CHANGED`，**只有 state === 'rewarded' 才发奖**。
- 监听 `PAUSE_STATE_CHANGED` / `AUDIO_STATE_CHANGED` 统一处理暂停和静音。
- 加载完成要 `bridge.platform.sendMessage('game_ready')`。

**广告位清单**（都已接好，别删）：主菜单静态横幅 / 通关后"看广告 ×2 金币" / 失败后"看广告 +3 秒续命" / 开局前"看广告送增幅" / 商店免费宝箱 / 每日奖励 / 每 3 关一次插屏（在菜单里，绝不在战斗中）。

---

## 7. 体积账本

| 项 | 大小 |
|----|------|
| vendor/three.min.js | ~654 KB |
| src/ 全部 | ~200 KB |
| standalone 单文件 HTML | ~0.9 MB |
| 三个包 + zip 合计 | ~4 MB |

工作区总占用远低于 128MB。**加任何二进制资源前先在这里记账。**

---

## 8. Git 操作备忘

远端已配好带 token 的 URL（存在 `.git/config`，不会进快照，**不要把 token 写进任何被提交的文件**）。

```bash
cd /home/user/model
node 001/tools/build.js
git add -A && git commit -m "feat: ..." && git push
```

---

## 变更日志（只追加，不改写）

- **2026-09-28** — 建立仓库结构、本 HANDOFF、项目【001】《TITAN LOOP》立项。
