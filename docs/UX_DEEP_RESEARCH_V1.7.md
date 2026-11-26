# TransFlow 深度 UX 调研与 v1.7.0 优化

> 状态：已实施（2026-11-26）
> 方法：Nielsen 启发式评估 + WCAG 2.2 AA 检查 + 竞品功能矩阵 + 多视口截图
> 结果：34/34 冒烟、46 单测；复习/管理/设置/弹窗多轮截图通过

---

## 1. 方法

### 1.1 启发式评估

按 [Nielsen 10 条启发式](https://www.nngroup.com/articles/ten-usability-heuristics/) 逐项检查：

| 启发式 | 当前表现 | 结论 |
|---|---|---|
| 系统状态可见 | 同步时间、到期数、掌握度、页面连接状态 | 基本满足；复习页缺“今日进度” |
| 贴近真实世界 | “待复习/新词/已掌握/认识/模糊” | 满足 |
| 用户控制与自由 | 复习只能前进，误点无法撤回 | **不满足** |
| 一致性与标准 | 设置/管理/复习三套视觉语言 | 有意区分；按钮层级基本一致 |
| 防错 | 删除/清空/删除云端有确认 | 满足；复习误评无保护 |
| 识别而非回忆 | 管理页展示上下文/标签/日期 | 满足 |
| 灵活高效 | 键盘翻译、复习 1–4 | 部分；Space 行为不符合 Anki 习惯 |
| 美观极简 | v1.6 已去弹窗调试噪音 | 明显改善 |
| 错误恢复 | 同步错误、UUID 校验、导入报告 | 复习无撤销 |
| 帮助文档 | 快捷键提示零散 | 需常驻提示 |

### 1.2 可访问性

按 [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/quickref/) 和 [focus-visible 实践](https://github.com/lennix1337/genexus18mcp/blob/98ea66a79cb3e0efeaa47b45c3ebdf65289e62b9/.gemini/skills/frontend/design-system-builder/references/accessibility.md)：

- 所有交互元素应有 `:focus-visible` 2px 轮廓。
- 目标尺寸 ≥24×24（文字按钮足够，图标按钮需检查）。
- 模态框需要 `role=dialog`、`aria-modal`、Esc/点击外部关闭。
- 动效尊重 `prefers-reduced-motion`。
- 筛选按钮使用 `aria-pressed`，设置 tab 使用 `aria-current`。

### 1.3 竞品参考

| 产品/资料 | 关键做法 | 本次采纳 |
|---|---|---|
| [Anki 快捷键](https://slidetoanki.com/blog/anki-keyboard-shortcuts-guide) | `Space` 显示答案；`1–4` 评分；`Z` 撤销 | 复习页改为同套键位，新增撤销 |
| [Readwise Active Recall](https://blog.readwise.io/remember-more-of-what-you-read-with-readwise/) | 主动回忆、到期队列、低摩擦进入 | 今日目标 + 到期数 + 单卡聚焦 |
| [Immersive Translate Popup](https://deepwiki.com/immersive-translate/immersive-translate/4-user-interface#1) | 弹窗只保留高频动作 | v1.6 已收敛，本版继续减少噪音 |
| [SaaS 设置页清单](https://www.saasui.design/settings-page-ui-design) | 分组导航、即时反馈 | v1.6 section tab，本版保持 |
| [SaaS Navigation](https://raw.githubusercontent.com/oborchers/fractional-cto/refs/heads/main/saas-design-principles/skills/saas-navigation/SKILL.md) | 主入口唯一、上下文工具 | 单词本摘要 + 管理页唯一管理面 |

---

## 2. 本轮发现（按严重度）

| # | 严重度 | 问题 | 证据 | 修复 |
|---|---|---|---|---|
| 1 | 高 | 复习评“不认识”后，文案说“10 分钟后回到队列”，但本轮队列不会再次出现 | 代码只 `index+1`，无 requeue | 同一轮把 again 卡片追加到队尾；避免重复追加 |
| 2 | 高 | 复习误点无法撤回 | 没有撤销入口 | `Z` / 按钮撤销，恢复 mastery/nextReviewAt/interval 等快照 |
| 3 | 中 | `Space` 在已翻面时把答案藏回去，不符合 Anki 习惯 | 键盘处理 `toggle` | 未翻面→显示；已翻面→按“认识”评分 |
| 4 | 中 | 没有今日进度/目标，用户不知道“今天够不够” | 只有到期数 | 今日目标 20，显示已复习 X/20 与进度条 |
| 5 | 中 | 管理页一次渲染全部词条（最多 5000） | `filtered.map` 全量 | 每页 50 条 + 分页 |
| 6 | 中 | 无法按标签筛选 | 只有搜索/状态 | 新增标签下拉筛选 |
| 7 | 低 | 管理页行操作只有编辑/删除 | — | 新增“复制 原文+译文” |
| 8 | 低 | 空列表没有行动入口 | 只有一句空文案 | 空状态增加“添加第一个” |
| 9 | 中 | 键盘焦点样式不完整 | 仅有部分 hover | 统一 `:focus-visible` + reduced motion |
| 10 | 低 | 设置 tab 无 `aria-current`、筛选无 `aria-pressed` | — | 补齐语义 |

---

## 3. 实施内容

### 3.1 复习页

- 今日目标：`reviewedToday / 20`，进度条；完成页同样展示。
- 四档评分显示**下次间隔预览**：10 分钟 / 1 天 / 2 天 / 3 天…。
- `again` 卡片在同一轮追加到队尾（最多一次/张），符合“再练一遍”的直觉。
- 撤销：
  - `Z` 或 `Ctrl/Cmd+Z`，或按钮。
  - 恢复 `mastery / reviewCount / lastReviewedAt / nextReviewAt / intervalDays / updatedAt`。
  - 如果该次评分触发了 requeue，撤销时移除追加卡。
- 键盘：
  - `Space`：未翻面显示；已翻面 = 认识（Good）。
  - `1–4`：不认识/模糊/认识/很简单。
  - `Z`：撤销；`Esc`：退出。
- 完成页统计：认识 X · 模糊 Y · 不认识 Z。

### 3.2 管理页

- 分页：每页 50 条，上一页/下一页，显示第 x/y 页。
- 标签筛选：从全部词条聚合标签，下拉筛选。
- 行操作新增“复制”（原文 + Tab + 译文）。
- 空状态新增“添加第一个”。
- 筛选按钮 `aria-pressed`；模态框 `role=dialog` / `aria-modal`。
- 焦点轮廓与 reduced-motion。

### 3.3 设置/弹窗（承接 v1.6）

- 设置：5 个 section tab、quickbar、单词本摘要、渠道 2 列。
- 弹窗：正常不显示诊断；异常才展开；空结果单行；词库/复习入口带数量。

---

## 4. 验证

### 4.1 自动化

- `pnpm exec tsc --noEmit`
- `pnpm exec vitest run`：46 通过
- `bash scripts/smoke.sh`：34/34

### 4.2 截图矩阵

| 视口 | 页面 | 检查 |
|---|---|---|
| 380×640 | 弹窗 | 首屏无诊断噪音、tabs、空结果 |
| 454×696 | 设置-翻译/单词本 | tab、2 列渠道、单词本摘要 |
| 390×780 | 管理页 | 统计 2×2、工具栏换行、分页/标签 |
| 390×780 | 复习页 | 卡片、间隔预览、今日目标、撤销 |
| 1100×820 | 管理/复习 | 桌面留白、列表密度 |

### 4.3 交互实测

- 复习：开始 → Space 翻面 → 2/3/4 评分 → Z 撤销 → 状态恢复。
- 管理：搜索/标签筛选/分页/编辑/批量删除/导入导出。
- 同步：UUID 恢复、立即同步、删除云端。

---

## 5. 验收清单

- [x] 复习“不认识”在同一轮会再次出现（不重复追加）。
- [x] `Z` 撤销恢复评分前状态，并移除 requeue。
- [x] `Space` 未翻面显示、已翻面按“认识”。
- [x] 今日目标与间隔预览可见。
- [x] 管理页 >50 条时分页；标签筛选生效。
- [x] 空状态可添加；复制可用。
- [x] 焦点可见、reduced-motion 生效。
- [x] 34 冒烟 / 46 单测。
- [x] 360/390/454/1100 无横向溢出。

## 6. 仍待做（backlog）

- 每日目标可配置（当前固定 20）。
- 连续复习天数 / 热力图。
- 管理页批量打标签、撤销删除。
- 复习卡片发音/例句填空。
- 命令面板（⌘K）与最近翻译。
