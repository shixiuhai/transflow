# 译流 TransFlow

> 快速、开源的双语阅读层。整页双语、划词翻译、输入框翻译，默认接入国内低延迟渠道。

**状态：v0.2.0 开发预览。** 文本翻译、划词翻译、整页双语（4 种样式 / 环境条 / 缓存 / 取消还原）已可用；输入框翻译、术语表、用量面板、百度渠道正在开发中。

## 为什么做它

- **快**：视口优先、批量请求、缓存命中即时渲染。
- **融合**：译文继承页面排版与配色，不像外挂面板（Fusion UI）。
- **开箱即用**：默认火山引擎（每月前 200 万字符免费），三步完成配置。
- **真正开源**：MIT、无账号、无遥测、密钥只存本机。

## 开发

```bash
pnpm install
pnpm dev        # 启动开发模式（自动打开 Chrome）
pnpm build      # 产物：.output/chrome-mv3
pnpm test       # 单元测试
pnpm typecheck
pnpm smoke      # 端到端冒烟（需要 Chrome for Testing / Chromium）
```

`pnpm smoke` 会启动本地 fixture、加载扩展、通过 service worker 触发整页翻译、断言译文块与还原，并截图到 `/tmp/tf_page.png`。默认使用 Playwright 缓存里的 Chrome for Testing；可通过 `CHROME_BIN` 指定。

可选：`MODE=card pnpm smoke` 验证不同译文样式（blend / card / mask / replace）。

加载扩展：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择 `.output/chrome-mv3`。

## 配置火山引擎（推荐）

1. 注册并实名：https://console.volcengine.com/
2. 开通机器翻译：https://console.volcengine.com/mt
3. 创建子用户与密钥：https://console.volcengine.com/iam/user
   - 新建用户 → 勾选「编程访问」→ 授权 `TranslateFullAccess` → 创建密钥
4. 在扩展「设置 → 翻译渠道 → 火山引擎」填入 Access Key ID / Secret Access Key，点「测试连接」。

免费额度：每月前 200 万字符；超出 49 元/百万字符。

其他渠道：OpenAI 兼容（DeepSeek / GLM / Qwen）、本地模拟（离线演示）。

## 架构

```
src/
  core/            纯 TS，可单测：类型、语言映射、Provider、签名、设置
  entrypoints/     background / content / popup / options
  ui/              设计 token
tests/unit/        单元测试
```

- 整页翻译是块级渲染：译文作为原文块的 sibling 插入，不重写原 DOM；支持 blend / card / mask / replace 四种样式，按页面背景自动配色。
- 缓存：L1 内存 + `chrome.storage.local`（30 天 TTL），整页去重后按块命中，二次翻译 0 请求。
- Provider 适配器统一接口，渠道差异（批量、语言码、签名）收敛在 `core/provider/`。
- 火山引擎使用 V4 签名（WebCrypto HMAC-SHA256），在 background 中完成，不经过页面。
- 注入 UI 使用 Shadow DOM，避免污染站点样式。

## 快捷键

- `Alt+S` 翻译选中文本
- `Alt+A` 翻译整页 / 还原（开发中）
- `Alt+D` 翻译输入框（开发中）

可在 `chrome://extensions/shortcuts` 修改。

## 许可

MIT
