# HANDOFF —— 交接文档（所有模型/Agent 编程前必须先读这个文件）

> ⚠️ 本文件**只允许追加 / 修正**，**严禁覆盖重写**。
> 新的 Agent 接手时：先读完本文件 → 再读 `NNN/README.md` → 再动代码。
> 追加新内容请写到文件最底部的「变更日志」区块。

---

## 0. 一句话总览

用户（甲方）要的是：**可直接下载双击就能玩的、看起来像完成品的商业级 H5 游戏**，
每个项目放在**用户给的编号子文件夹**里，**高频阶段性 push 回 GitHub**，
最终交付**两个包**（CrazyGames 广告 SDK 版 + Playgama 广告 SDK 版）。

---

## 1. 硬性约束（HARD CONSTRAINTS —— 违反即为交付失败）

| # | 约束 | 说明 |
|---|------|------|
| C1 | **编号子文件夹** | 用户会给形如【001】的编号。所有产出放进仓库根目录下的 `001/`。没有就新建。**不要把项目文件散在仓库根目录**（根目录只放 `handoff.md` 和 `README.md`）。 |
| C2 | **阶段性高频提交** | 绝不允许"全部做完再提交"。每完成一个可运行的里程碑就 `git add -A && git commit && git push`。用户的网站可能随时中断/回退，**中断时刻仓库里必须是可玩版本**。 |
| C3 | **HTML 优先打包** | 先保证 `index.html` 可点击开始游戏，再做其它。**不要把打包留到最后**。任何一次中断，用户 clone 下来都能玩。 |
| C4 | **离线可玩（file:// 协议）** | 用户是"下载后双击 index.html"。因此：**禁止 ES Module（`<script type="module">`）、禁止 `fetch()`/`XHR` 加载资源、禁止 CDN 外链**。全部用经典 `<script src="...">` + 本地文件 + 程序化生成的资源。 |
| C5 | **工作区 < 128MB** | 超过会随机丢文件。不要放大模型文件、不要 `npm install`（`node_modules` 也不会被快照保存）。 |
| C6 | **单个游戏包 ≤ 20MB** | 目标其实应控制在 **≤ 5MB**，越小越好（CrazyGames/Playgama 审核和加载体验都看重这个）。 |
| C7 | **PC + 手机双端可玩** | 鼠标 / 触屏都要支持，响应式布局，横竖屏都不能崩。 |
| C8 | **不要用被快照排除的目录名** | 禁止使用：`build` `dist` `out` `target` `coverage` `node_modules` `.cache` `.venv` `__pycache__` 等。**改用 `packages/`、`releases/`、`assets/`、`lib/`**。这些名字的文件夹在工作区快照里会被丢掉。 |
| C9 | **两个发行包** | 一个接 **CrazyGames SDK**，一个接 **Playgama SDK**。共享同一份核心代码，只有 `ads.js` 适配层不同。 |
| C10 | **广告位给足** | 用户靠广告赚钱。主菜单静态横幅 + 关卡间插屏 + 通关后"看广告翻倍金币" + 死亡后"看广告复活" + 商店"看广告白嫖" + 关卡开始"看广告加 BUFF"。 |

---

## 2. 用户的偏好（PREFERENCES）

- **玩法只给一句话，细节要 Agent 自己脑补到大师级。** 不要回头问"你想要什么细节"，直接补全并做好。
- **反馈感 = 第一优先级。** 打击感、屏幕震动、顿帧、飘血字、粒子、连杀播报、音效层次。"要让玩家玩爽还愿意继续玩"。
- **看起来像完成品，不要半成品。** 有主菜单、设置、商店、关卡、Boss、结算、成就感曲线。UI 要精致。
- **主题要劲爆、抓眼球**，让人一看封面就想点进来玩。
- **关卡制**（不是纯无尽），每关有目标、有结算、有成长。
- **音乐音效要"大师级"且可商用**。见第 3 节的实现决策。
- 用户会持续给反馈 → 按反馈迭代优化，修明显 BUG。

---

## 3. 关键技术决策（已定，后续 Agent 请沿用，除非用户要求改）

### 3.1 引擎
- **Three.js r159 UMD**（`001/game/lib/three.min.js`，656KB，经典 script 标签，file:// 可跑）。
- **不要升级到 r160+ 的 ESM-only 版本**，会破坏 C4（离线可玩）。

### 3.2 美术资源
- **全部程序化生成几何体**（BoxGeometry/Capsule/Sphere 拼装 + 自定义着色器 + 顶点色）。
  - 理由：0 外部文件 → 包体 < 2MB，满足 C6，且 file:// 下无跨域问题。
  - 不要引入 GLTF/FBX/贴图文件，除非能保证总包 ≤ 20MB 且用 base64 内联。

### 3.3 音频（重要）
- **全部用 Web Audio API 实时合成**（`001/game/js/audio.js`）。
- **版权说明**：所有 BGM 与音效均为**本项目原创程序化合成**，不含任何第三方采样，
  **100% 可商用、无版权风险**，且体积为 **0 字节**（不占包体）。
  这比"网上找免费素材"更安全（免费素材常有 attribution / 平台二次授权问题，
  CrazyGames 和 Playgama 都会审核音频授权）。
- BGM 为**自适应分层音乐**：基础层 + 战斗层 + 高压层，随场上敌人密度动态混音。
- 若用户坚持要真实采样音乐，再考虑内联 base64 的 CC0 素材，但必须复核包体 ≤ 20MB。

### 3.4 目录结构（约定）
```
/handoff.md                     ← 本文件，只追加
/001/
  README.md                     ← 该项目的说明 + 进度
  game/                         ← 共享主线源码（无广告 SDK 的纯净版，可直接玩）
    index.html
    lib/three.min.js
    js/audio.js  js/game.js  js/ads.js(stub)
  packages/
    crazygames/                 ← = game/ + CrazyGames ads.js
    playgama/                   ← = game/ + Playgama ads.js
  releases/                     ← 打好的 zip
  tools/build.sh                ← 一键从 game/ 生成两个包 + zip
```
- **`game/` 是唯一真源（single source of truth）**，改代码只改 `game/`，
  然后跑 `bash 001/tools/build.sh` 重新生成两个包。**不要手动改 packages/ 里的文件。**

### 3.5 广告适配层
- `js/ads.js` 暴露统一 API，核心游戏只调这套接口，不关心是哪个平台：
  ```js
  Ads.init()                       // Promise
  Ads.showBanner(slotElementId)    // 主菜单/商店静态横幅
  Ads.hideBanner()
  Ads.showInterstitial()           // Promise<void>  关卡间插屏
  Ads.showRewarded()               // Promise<boolean>  true=看完给奖励
  Ads.gameplayStart() / gameplayStop()  // 平台要求的对局生命周期上报
  Ads.happyTime()                  // CrazyGames 专有，非必须
  ```
- **纯净版 `game/js/ads.js` 是 stub**：本地直接玩时，奖励广告弹一个 2 秒假进度条后直接给奖励，保证 C4 离线可玩。
- 平台 SDK 是外链脚本，**必须写成加载失败自动降级到 stub**，否则离线打开会卡死（这是最容易犯的致命 BUG）。

---

## 4. 每次接手的检查清单（CHECKLIST）

1. [ ] 读 `handoff.md`（本文件）+ `NNN/README.md`
2. [ ] `cd repo && git pull`
3. [ ] 用浏览器/无头检查 `001/game/index.html` 当前是否**真的能开始游戏**
4. [ ] 改代码只改 `001/game/`
5. [ ] 每个里程碑：`bash 001/tools/build.sh` → `git add -A && git commit -m "..." && git push`
6. [ ] 提交前自检：包体大小、控制台报错、手机触屏、file:// 打开
7. [ ] 把这次做了什么**追加**到本文件底部的变更日志

---

## 5. 已知坑（PITFALLS）

- ❌ `<script type="module">` → file:// 下 CORS 报错，白屏。用经典 script。
- ❌ `fetch('assets/x.json')` → file:// 下被拦截。资源全部内联或程序化生成。
- ❌ 目录取名 `dist/` `build/` → 工作区快照会丢弃，下个回合文件消失。
- ❌ 平台 SDK `<script src="https://sdk...">` 没做 onerror 降级 → 离线白屏。
- ❌ Three.js r160+ 移除了 UMD 构建。锁死 r159。
- ❌ 移动端 `devicePixelRatio` 不封顶 → 低端机掉帧。封到 1.5。
- ❌ Web Audio 必须在**用户手势**（点击"开始游戏"）里 `resume()`，否则无声。

---

## 6. 变更日志（APPEND ONLY —— 新内容加在最底部，不要删改上面的）

### 2026-09-28 · Agent · 项目 001 立项
- 仓库为空仓库，从零初始化。
- 建立本 handoff.md、目录结构约定、技术决策（Three.js r159 UMD + 程序化美术 + Web Audio 合成音频）。
- 项目 001 主题定为：**《尸潮狂奔 3D / ZOMBIE RUSH 3D》** —— 第三人称自动跑酷 + 全向射击 + 丧尸围城。
  - 选题理由：丧尸 + 跑酷射击在 CrazyGames/Poki 上是长期高点击率品类，封面冲击力强，
    规则零学习成本（指哪打哪），符合用户"劲爆抓眼球"的要求。

---

### 2026-09-28 · Agent(Arena) · 项目 001 新增第二款游戏《TITAN LOOP 十秒轮回·弑神》

**背景**：接手时仓库已有前一位 Agent 的《ZOMBIE RUSH 3D》（`001/game/`、`001/packages/`、`001/releases/`）。
用户随后给出了一个**具体到玩法层面的新规格**（10 秒关卡 / 主角站桩 / 鼠标即枪口 / 五列场地 / BOSS 逼近），
与跑酷丧尸并不是同一个东西。

**处理方式（重要，后来者请沿用这个原则）**：
- **没有删除、没有改动前一位 Agent 的任何文件。** 两款游戏在 `001/` 下并列共存。
- 新游戏整体放在 `001/titan-loop/`，内部目录结构对齐本文件 3.4 节的约定。
- 本 handoff 只在文末追加，未改动上面任何一个字。

**新增目录**
```
001/titan-loop/
  README.md            ← 该游戏的设计说明 + 进度 + 数值报告
  AUDIO_LICENSE.md     ← 音频版权声明（程序化合成，可商用，零风险）
  index.html           ← 开发预览版（引用 src/ 与 lib/，方便改代码）
  src/                 ← 唯一真源：00_core 10_audio 20_ads 30_data 40_world 50_game 60_ui 70_boot + style.css
  lib/three.min.js     ← three.js r160 UMD (MIT)
  packages/
    standalone/index.html   ← 单文件，双击即玩
    crazygames/index.html   ← + CrazyGames SDK v3
    playgama/index.html     ← + Playgama Bridge (+ playgama-bridge-config.json)
  releases/*.zip
  tools/build.js       ← 零依赖打包（Node 自带 fs/path/zlib，自己实现了 zip 写入器）
  tools/smoketest.js   ← 无头冒烟测试 + 数值平衡体检
```

**命令**
```bash
node 001/titan-loop/tools/smoketest.js   # 先跑测试
node 001/titan-loop/tools/build.js       # 再打包（每次 push 前必跑）
```

**对本文件既有内容的两处技术勘误（不是推翻，是补充实测结果）**
1. 3.1 / 第 5 节说「Three.js r160+ 移除了 UMD 构建，锁死 r159」——
   实测 **r160 仍然带 `build/three.min.js` UMD**（只是打了 deprecation 标记），
   `file://` 下正常工作，已验证 `REVISION==="160"`。真正移除 UMD 的是 **r161+**。
   本项目用 r160，并把文件头那句 `console.warn` 的弃用提示删掉了（保留 MIT 版权头），
   让玩家控制台是干净的。**若要再升级，必须停在 r160，不要碰 r161+。**
2. C8 那条「禁止 build/ dist/」是对的，而且很关键 —— 我一开始就踩了这个坑，
   已把产物目录改成 `packages/` 与 `releases/`。后来者务必检查自己的构建脚本输出路径。

**这一款的设计要点（供后续迭代，勿随意推翻）**
- 核心机关：**泰坦的位置就是倒计时**。它从 x=46 走到 x=5.6，恰好走满 10 秒。
  玩家不需要看表，抬头看它离你多近就知道还剩多久 —— 这是整个游戏的压迫感来源。
- 五列 = 五种收益类型，10 秒内的**分配决策**就是全部玩法：
  C1 小兵（不打会撞掉护盾）/ C2 增幅塔（本局变强，越早打复利越高）/
  C3 轮回核（永久碎片，**失败也保留** —— 这是"轮回"的意义）/
  C4 守卫+裂隙（护盾板会转，要等时机）/ C5 泰坦（唯一的胜利条件）。
- 数值不是拍脑袋：`TL.refPower(n)` 是期望战力曲线，血量由它**反推**，
  `par`（标准用时）因此成为真正的设计目标，星级门槛挂在 par 上。
  系数用 `tools/smoketest.js` 里那个"中等水平 AI 玩家"实测标定过，
  当前状态：AI 能通 23/23 抽样关，但绝大多数只有 1 星 —— 通关不难、高星很难。
- 音频与前作同策略：100% Web Audio 程序化合成，0 字节资源，0 版权风险。
  这一款做了 7 层自适应 BGM（最后 4.2 秒会加入上扫紧张层）与 30+ 音效。

**广告位（8 处）**：主菜单 300×250 静态横幅 / 通关 ×2 金币 / 失败 +3 秒续命 /
商店免费宝箱（180s 冷却）/ 每日奖励翻倍 / 每 3 关插屏（**只在菜单，绝不打断战斗**）。
两个平台都做了「SDK 加载失败自动降级到本地占位广告并照常发奖」，离线打开不会卡死。


### 2026-09-28 · Agent(Arena) · 《TITAN LOOP》迁出 001 → 独立编号 002

用户指示：把 TITAN LOOP 搬到根目录的 `002/`，并要求**改用真实 3D 模型与真实 UI 素材**
（原来的纯程序化几何体被评价为「太粗糙、太 AI 味」），场景与排版要重做到大师级。

- `001/` 已**完全还原**为前一位 Agent 的原状（README.md 里我追加的段落也撤掉了），
  从此 001 与 002 互不干扰。
- TITAN LOOP 全部内容现位于 `002/`，目录结构不变（src / lib / packages / releases / tools）。
- 编号规则确认：**一个编号 = 一个游戏**，不要再往别人的编号里塞东西。
