# 性能基准

> 环境：Chrome for Testing 159（headless）、Linux、mock 渠道（每批 80ms 延迟）、fixture 7 段。
> 命令：`pnpm smoke`（输出 `first block` / `cache hit` / `1,000 block` 三行）。

| 指标 | 目标 | mock 基线 | 说明 |
|---|---|---|---|
| 首段出现 | ≤800ms | **146ms** | 含一次 80ms mock 请求 + DOM 插入 |
| 整页 7 段 | ≤1s | **146ms** | mock 单批返回，首段≈整页 |
| 缓存命中整页 | ≤300ms | **27ms** | 0 网络请求，仅 DOM 插入 |
| 1,000 块插入（含强制布局） | ≤120ms | **74ms** | `div.tf-block` + 文本 + layout |
| zip 体积 | <800KB | **104KB** | 含 5 个尺寸图标 |

## 真实渠道待测

火山/百度/DeepL 的真实延迟、首段与整页时间需要 AK/SK 后补测；`pnpm smoke` 已把计时打印出来，切换 `provider.active` 即可复用同一脚本。

## 说明

- mock 渠道固定 80ms/批，因此首段与整页时间接近；真实渠道下首段会明显早于整页（视口优先 + 分批）。
- 1,000 块基准直接调用 DOM 插入模式（与 `renderBlock` 相同），并强制一次布局，排除网络因素。
- 目标值来自 `01-UI-Fusion深度分析与定稿.md` / `00-调研与重构方案.md`。
