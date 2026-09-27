# 音频许可声明 / Audio Licensing Statement

## 结论先行

**《TITAN LOOP》中的全部音乐与音效，都是本作品用 Web Audio API 实时合成的原创声音。**
**不含任何第三方采样、录音、音轨或素材库内容。因此本作品在任何商业平台上架、分发、变现，均无版权风险，也无需署名。**

> All music and sound effects in TITAN LOOP are original, generated in real time by the game's own
> Web Audio synthesis engine (`src/10_audio.js`). **No third-party samples, recordings, loops or
> library assets are used.** The package is therefore fully clear for commercial use on CrazyGames,
> Playgama, or any other portal, with **no attribution required**.

---

## 为什么选择程序化合成，而不是去网上下载"可商用"音频

| 维度 | 下载素材 | 程序化合成（本作采用） |
|------|----------|------------------------|
| 版权 | 即使是 CC0，也要逐个核验来源、保存证据链；平台审核/DMCA 争议时举证成本高 | 声音是代码生成的，**著作权天然属于本项目**，零争议 |
| 体积 | 一套像样的 BGM + 30 个音效，OGG 压缩后普遍 3–8 MB | **0 字节资源**，约 20 KB 代码 |
| 20MB 上限 | 音频通常是最大头，容易顶到上限 | 完全不占额度 |
| `file://` 双击运行 | 需要 `fetch`/`XHR` 载入，本地协议下会被 CORS 拦截 | 不需要任何网络请求，双击就有声 |
| 自适应 | 固定音轨，只能淡入淡出 | **分层动态混音**：鼓/贝斯/军鼓/踩镲/琶音/Pad/紧张层，随剩余时间与战况实时增减 |
| 迭代 | 改一个音色要重新找素材、重新导出 | 改一行参数即可 |

---

## 音频系统实现概要（`src/10_audio.js`）

**主控链**
```
各音源 ─┬─> musicBus ─┐
        └─> sfxBus   ─┼─> DynamicsCompressor ─> 高频削减(-3dB @9kHz) ─> destination
        ├─> revBus ─> Convolver（程序生成的脉冲响应）┘
        └─> delayBus ─> Delay(0.375s) + 反馈 + 低通
```
- 混响脉冲响应由带指数衰减包络的白噪声实时生成，无需 IR 文件。
- 压缩器负责在大量音效叠加时守住动态，保证"打击感层叠但不糊"。

**自适应 BGM** —— 132 BPM（BOSS 关 142），16 分音符步进音序器，7 个层：

| 层 | 触发条件 | 合成方式 |
|----|----------|----------|
| Kick | 始终 | 正弦 150→40 Hz 下滑 + 低通白噪 click |
| Sub-bass | 始终 | 锯齿 + 方波低八度，共振低通包络 |
| Snare | intensity > 0.18 | 带通白噪 + 三角波 body |
| Hi-hat | intensity > 0.30 | 高通白噪，第 8 步开镲 |
| Arp | intensity > 0.42 | 方波→锯齿（强度越高越亮），共振低通 + 节拍延迟 |
| Pad | 每小节 | 3 个失谐锯齿，长包络，重混响 |
| Tension riser | 剩余时间 < 4.2s | 锯齿频率与带通同步上扫，制造"要来不及了"的生理压力 |

三个幕使用不同的调式与根音，音乐主题随场景变化：
- Act 1 熔核废墟 — A 小调五声，根音 A1
- Act 2 霜蚀深渊 — 异域音阶，根音 B♭1
- Act 3 虚空王庭 — 不协和音阶，根音 G#1

**音效库** —— 30+ 条，全部由振荡器 + 滤波白噪 + 包络叠加而成：
射击 / 重型射击 / 命中 / 暴击 / 击杀 / 大爆炸 / 增幅获得 / 轮回核碎裂 / 金币 / 受伤 /
护盾破碎 / 泰坦脚步 / 泰坦咆哮 / 倒计时 / 开火号令 / 胜利 / 失败 / 星星 / UI 点击 / UI 悬停 /
拒绝 / 升级 / 开箱 / 连击 / 破空 / 心跳 / 慢动作 / 关卡解锁。

---

## 如果将来要替换成外部音源

必须同时满足：

1. 许可证为 **CC0 / Public Domain**（或明确买断的商用授权），
2. 在本文件登记：文件名、来源 URL、作者、许可证、下载日期，
3. 重新核算 20MB 体积上限，
4. 音频改为内联 DataURI 或与 HTML 同目录，**不能破坏 `file://` 双击可玩**。

在满足以上四条之前，**不要移除程序化音频引擎**。

---

## 第三方代码

| 组件 | 版本 | 许可证 | 用途 |
|------|------|--------|------|
| three.js | r160 | MIT | 3D 渲染 |

three.js 的 MIT 许可证允许商用与再分发，版权声明已保留在内联的 `three.min.js` 文件头部。
除此之外，本项目不依赖任何第三方代码、字体、图片或音频。字体使用系统字体栈，图形全部为运行时生成的几何体与 CSS。
