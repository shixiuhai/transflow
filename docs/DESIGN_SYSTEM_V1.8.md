# TransFlow 视觉一致性审计与 v1.8.0 设计系统

> 状态：已实施（2026-11-26）
> 问题：复习页全黑、词库页冷灰、设置页暖白、弹窗白底，页面之间像四个产品
> 结果：统一为「暖纸 + 墨绿」设计系统；浅色/深色均一致；34/34 冒烟、46 单测

---

## 1. 审计：为什么会“一会暖一会黑”

| 页面 | 改造前背景 | 来源 | 问题 |
|---|---|---|---|
| 复习页 | `#0B1512` 近黑 + 荧光青 | 独立 `review/style.css`，未引入 tokens | 与其它页面完全割裂 |
| 词库页 | `#F3F6F2` 冷灰绿 | 独立 `vocab/style.css`，未引入 tokens | 冷灰 vs 设置页暖白 |
| 设置页 | `--tf-bg #ffffff` / `#f6f7f9` | `src/ui/tokens.css` | 中性白，缺少温度 |
| 弹窗 | 同设置 tokens | `popup` 引入 tokens | 白底，与“暖纸”不一致 |
| 气泡 | 暖纸/自动/毛玻璃/高对比 | content Shadow DOM | 本身是用户可选样式，保留 |

根因不是“审美”，是**没有设计系统**：

1. 每个页面独立写 CSS，颜色/圆角/阴影各自为政。
2. `review` 和 `vocab` 两个新页面根本没有 import 共享 tokens。
3. tokens 只有中性色，没有“暖纸”语义。
4. 深色模式只在 tokens 里定义，两个新页面各自硬编码，导致深色下更割裂。

---

## 2. 设计决策

### 2.1 一个主视觉

**暖纸（Warm Paper）+ 墨绿（Teal）**：

- 背景：暖米白 `#F5F2EA`（canvas）
- 表面：近白暖纸 `#FFFDF8`（surface）
- 文字：墨绿黑 `#1E2A24`
- 强调：深青 `#0F766E`
- 圆角：8 / 10 / 16
- 阴影：低对比暖灰阴影，不用纯黑重阴影

复习页不再用“全黑专注模式”；专注感通过**留白、单卡、字号层级**实现，而不是换一套配色。

### 2.2 语义 tokens

`src/ui/tokens.css`：

| Token | Light | Dark |
|---|---|---|
| `--tf-bg` | `#FFFDF8` | `#1B231E` |
| `--tf-bg-soft` | `#F5F2EA` | `#141A17` |
| `--tf-ink` | `#1E2A24` | `#F3F0E8` |
| `--tf-muted` | `#66756D` | `#A8B5AC` |
| `--tf-faint` | `#93A198` | `#7D8C83` |
| `--tf-line` | `#E6E0D3` | `#2D3731` |
| `--tf-accent` | `#0F766E` | `#2DD4BF` |
| `--tf-accent-soft` | `#E7F3EE` | `rgba(45,212,191,.12)` |
| `--tf-on-accent` | `#FFFFFF` | `#062A26` |
| `--tf-shadow-card` | 暖灰 6% | 黑 24% |
| `--tf-shadow-pop` | 暖灰 14% | 黑 38% |

深色模式通过 `prefers-color-scheme` 自动切换；所有页面共享同一套值。

### 2.3 组件规则

| 组件 | 规则 |
|---|---|
| 页面 | `background: var(--tf-bg-soft)`，不写死颜色 |
| 卡片/列表 | `var(--tf-bg)` + `var(--tf-line)` + `var(--tf-shadow-card)` |
| 主按钮 | `var(--tf-accent)` + `var(--tf-on-accent)` |
| 次按钮 | `var(--tf-bg)` + line；hover 用 accent-soft |
| 筛选 chip | 默认 bg-soft；选中 accent |
| 弹窗 | surface + line + shadow-pop；`role=dialog` |
| 焦点 | 2px accent outline，offset 2px |
| 动效 | 尊重 `prefers-reduced-motion` |
| 复选框 | `accent-color: var(--tf-accent)` |

---

## 3. 实施

### 3.1 共享 tokens

- 更新 `src/ui/tokens.css`：暖纸 + 墨绿 + 深色对应值 + 阴影/圆角/on-accent。
- `review/main.tsx`、`vocab/main.tsx` 新增 `import '../../ui/tokens.css'`（此前缺失）。
- `popup` / `options` 继续使用同一 tokens。

### 3.2 复习页

- 删除近黑背景、荧光青、深色卡片。
- 页面：暖纸渐变 canvas；卡片：surface + line + 暖阴影。
- 评分按钮：surface；hover 按语义色轻染（again 红、hard 黄、good/easy 青）。
- 今日目标/进度/撤销/快捷键全部保留。
- 深色模式自动变为暖炭色，而非纯黑。

### 3.3 词库页

- 冷灰 `#F3F6F2` → `var(--tf-bg-soft)`。
- 所有卡片、工具栏、行、弹窗、分页、toast 改用 tokens。
- 行 hover、标签、掌握度圆点、危险操作全部语义化。
- 深色模式与设置页一致。

### 3.4 设置/弹窗

- 设置页沿用 tokens，但修正快捷栏主按钮为 `var(--tf-accent)`，深色下不再固定深青。
- 弹窗去掉 textarea 的粗 focus 外框，改为底部 accent 线。
- 复选框/选区颜色统一。

---

## 4. 验证

### 4.1 截图矩阵

| 页面 | 宽 | 浅色 | 深色 |
|---|---|---|---|
| 弹窗 | 380 | ✅ | 继承 tokens |
| 设置 | 454 | ✅ | ✅ |
| 词库 | 390 | ✅ | ✅ |
| 复习 | 390 | ✅ | ✅ |

检查：

- 浅色下四个页面都是暖纸底 + 墨绿强调，复习页不再全黑。
- 深色下四个页面都是暖炭底，不再是“设置深灰、复习纯黑、词库冷灰”。
- 文字/边框/按钮在两种模式下都有足够对比。
- 复习卡片、评分按钮、管理行、设置卡片视觉语言一致。

### 4.2 自动化

- `tsc --noEmit`
- `vitest run`：46
- `smoke.sh`：34/34

---

## 5. 验收

- [x] 四个页面共用 `src/ui/tokens.css`，无页面级硬编码主背景。
- [x] 复习页浅色为暖纸，不再全黑。
- [x] 词库页与设置页同底色、同卡片、同边框。
- [x] 深色模式四页一致。
- [x] 按钮/卡片/圆角/阴影/焦点统一。
- [x] 复习功能（目标/间隔/撤销/requeue）不受影响。
- [x] 34 冒烟 / 46 单测。

## 6. 后续

- 设置里暴露「外观：跟随系统 / 浅色 / 深色」，目前只跟随系统（`ui.theme` 字段尚未接线）。
- 词库/复习页增加密度切换（舒适/紧凑）。
- 设计 tokens 增加 spacing scale，替换零散 padding。
