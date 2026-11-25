# 架构

## 目录

```
src/
  core/
    provider/      Provider 接口、注册表、火山/百度/OpenAI/Mock 适配器、V4/MD5 签名
    segment/       块级收集、去重/分批
    schedule/      限流器、并发映射
    cache/         缓存键、L1/L2 读取
    render/        主题采样、译文块渲染/清除
    settings/      schema、默认值、迁移、存储
    glossary.ts    术语占位符保护/还原
    usage.ts       本机用量统计
  entrypoints/
    background.ts  消息路由、渠道降级、术语表、用量、快捷键/右键菜单
    content.ts     整页编排、环境条、划词气泡、输入框翻译
    popup/         React 文本翻译
    options/       React 设置 + 首次向导
  ui/tokens.css    设计 token
```

## 数据流

1. 触发（Popup / 快捷键 / 右键 / 输入框）→ `chrome.runtime.sendMessage({type:'translate'})`。
2. Background 读取设置，按 `active → fallback` 依次尝试渠道；发送前做术语占位符保护，返回后还原并记用量。
3. Content 收集块级段落 → 去重 → 缓存 bulk 查询 → 分批请求 → 逐块插入译文。
4. 渲染使用块自己的 palette（背景/前景推导），支持 blend/card/mask/replace。

## 关键决策

- **块级而非文本节点**：保留句子上下文，避免 `Click <a>here</a>` 被拆碎。
- **sibling 插入**：不重写原 DOM，还原只需删除插入节点。
- **Shadow DOM**：气泡/环境条不受站点 CSS 影响；关闭态避免页面读取。
- **区块级取色**：同一页深色/浅色区块各自可读，对比度 ≥4.5:1。
- **缓存按文本**：同页重复文案只请求一次；TTL 30 天。

## 测试

- 单元/契约：`tests/unit`（34 个）。
- 端到端：`scripts/smoke.sh` + `scripts/smoke-cdp.mjs`（20 项）。
- 真实渠道：`scripts/volc-check.ts`（需 AK/SK）。
