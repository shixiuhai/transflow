# 弹窗底部导航与低对比度审计（v1.12.0）

> 问题：弹窗底部「翻译/整页/词库/复习/设置」看起来像禁用状态；同类 hint/meta 也偏浅。
> 方法：WCAG 2.2 AA + Material/Apple 导航栏规则 + 实际对比度计算 + 截图验证。

---

## 1. 专业规则

| 规则 | 要求 | 应用 |
|---|---|---|
| WCAG 2.2 SC 1.4.3 | 正文/小字对比度 ≥ **4.5:1** | tabs 标签、hint、meta |
| WCAG 2.2 SC 1.4.11 | UI 组件/图形 ≥ **3:1** | 图标、边框、active 指示 |
| WCAG 2.2 SC 2.5.8 | 目标 ≥ **24×24 CSS px** | 底部 tab 高度 48px |
| WCAG 2.2 SC 2.4.7 | 键盘焦点可见 | 全局 `:focus-visible` 2px |
| Material 3 Navigation Bar | 3–5 个目的地、图标 + 标签、active indicator、≥48dp | 5 个 tab，48px，accent-soft pill |
| Apple HIG Tab Bar | 图标 + 短标签、当前项明确高亮、避免仅靠颜色 | 图标 + active 背景 + 字重 + `aria-current` |
| Chrome Popup | 360px 宽、首屏信息密度高、底部导航稳定 | 5×72px，单行不换行 |

---

## 2. 修复前对比度

| 用途 | 颜色 | 背景 | 对比度 | 结论 |
|---|---|---|---|---|
| 旧 inactive tab / hint | `#93A198` | `#FFFDF8` | **2.65:1** | 失败 |
| 旧 muted 在 canvas | `#66756D` | `#F5F2EA` | **4.33:1** | 失败 |
| 旧 active tab | `#0F766E` | `#E7F3EE` | 4.81:1 | 刚过，但视觉太浅 |
| 新 inactive tab | `#5F6E66` | `#FFFDF8` | **5.28:1** | 通过 |
| 新 hint / faint | `#64716A` | `#F5F2EA` | **4.56:1** | 通过 |
| 新 active tab | `#0B5F59` | `#E7F3EE` | **6.60:1** | 通过 |

> 旧版并非“设计风格”，是 **faint token 本身不达标**；所以 hint、meta、计数、tab 全部一起偏浅。

---

## 3. 修改

### 3.1 tokens

`src/ui/tokens.css`：

```diff
- --tf-muted: #66756D;
- --tf-faint: #93A198;
+ --tf-muted: #5F6E66;
+ --tf-faint: #64716A;
```

- 两个值在暖纸 canvas 上分别 4.80 / 4.56，均过 AA。
- 保留层级：faint 仍比 muted 略浅，但不再用“看不清”换层次。
- 深色 token 维持 `#A8B5AC / #7D8C83`（7.56 / 4.56）。

### 3.2 弹窗底部导航

- 从 11px 纯文字 → **18px inline SVG 图标 + 10.5px 标签**。
- 高度 **48px**，5 等分，360px 下不换行。
- inactive：`var(--tf-muted)`；active：`var(--tf-accent-strong)` + `var(--tf-accent-soft)` 背景。
- active 同时有图标加粗、背景、字重、`aria-current="page"`，不再仅靠颜色。
- 增加 `nav aria-label="TransFlow 快捷导航"`。

### 3.3 诊断闪烁

- 新增 `tabReady` 门控：tab 信息返回前不显示“页面未注入”。
- 扩展页面显示「扩展页面」，不显示红色警告。
- 只有版本不一致 / 未注入 / 仅浮标时才展开诊断。

### 3.4 同类问题

- options `.hint`、popup `.count`、review `.stage-tools`、vocab `.context/tags small` 随 token 一起提升。
- 禁用按钮仍降低透明度（WCAG 对禁用控件豁免），但 active 导航不再落入低对比。
- 焦点轮廓统一 2px accent，offset 2px。

---

## 4. 验证

- 360×520 弹窗截图：5 个 tab 清晰、图标对齐、active pill 明确、无红框闪烁。
- inactive tab 实测 `rgb(95,110,102)`，对比度 5.28。
- 34/34 冒烟、51 单测。
- 所有页面仍使用同一 `--tf-*` 设计系统。

## 5. 后续

- 导航活跃项可加 2px 顶部指示条（当前 pill 已足够）。
- 若标签增加到 5 个以上，改为“更多”菜单，不压缩字号。
- 手动浅色/深色主题切换。
