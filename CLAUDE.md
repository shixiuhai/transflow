# 译流 TransFlow · 项目记忆

## 是什么、在哪

- 开源双语网页翻译扩展（MV3），产品名 **译流 TransFlow**，MIT。
- 代码目录：`/root/transflow`（本机唯一源码）。
- 旧仓库 `shixiuhai/chrome_translate` 已于 2026-11-25 删除（GitHub 404、本地工作副本移走），归档在 `/root/backups/chrome_translate-2026-11-25.{tar.gz,bundle}` 与 `...-src/`。
- 当前版本 **v1.4.0**：划词默认小写 `t`（单键/组合键可配），译文以**悬浮气泡**出现在选区右侧/下方/上方，带箭头；旧 `alt+s` 强制迁移，IME `Process` 用 `code` 兜底。
- 扩展 ID 已固定为 `hpdlgjmoidbdidccpkhjpbgkepgonlja`（manifest.key）；私钥 `~/.secrets/transflow-extension.pem`（600），`pnpm pack:crx` 打包。旧路径 ID `dnag...` 需一次性移除重装；设置页「版本检查」可选 management 权限一键移除旧版。
- 气泡需 `window` 捕获 + MAIN world 桥（keybridge.content.ts）；宿主挂到 body 并每 500ms 检查重挂，防止被站点 hydration 删除。
- **已发布 GitHub**：<https://github.com/shixiuhai/transflow>（public），v1.0.0 Release 附可安装 zip。
- **Chrome Web Store**：开发者控制台已登录（publisher `ecf36940-fdff-4bb9-a5d8-8a19fbda432c`）。
  - 2026-11-25：两步验证已开启；zip 上传成功，创建草稿 item `fjbdpcmhkfilgbnlpnfbcpbplpbekooj`。
  - 已填：说明（318 字）、首页/支持 URL、隐私权规范（单一用途 + storage/activeTab/scripting/contextMenus/主机权限理由 + 隐私政策 URL + 4 个确认勾选）。
  - 待补：类别=效率、语言=中文（简体）、商店图标 128、至少 1 张 1280×800 截图；然后保存草稿 → 提请审核。
  - 登录邮箱 `xiuhaishi@gmail.com`；开发者联系邮箱建议改为 `shixiuhai@shixiuhai.serv00.net`。
- 联系邮箱：`shixiuhai@shixiuhai.serv00.net`（Serv00）。

## 技术栈与目录

WXT 0.21 + TypeScript 5.9 + React 19 + Vite 8；包管理 pnpm 11。

```
src/core/provider/   渠道接口、注册表、火山/百度/OpenAI/Mock 适配器、V4/MD5 签名
src/core/segment/    块级收集、去重/分批
src/core/render/     主题取色、译文块渲染/清除
src/core/            缓存、限流、设置、术语表、用量
src/entrypoints/     background / content / popup / options
tests/unit/          34 个单元/契约测试
scripts/             smoke / volc-check / volc-bench / volc-e2e / mock-ai
docs/                SMOKE / PERF / PROVIDERS / ARCHITECTURE / RELEASE / STORE
```

## 常用命令

```bash
cd /root/transflow
pnpm install
pnpm typecheck
pnpm test          # 34 passed
pnpm smoke         # 22 项端到端（需要 Chrome for Testing）
pnpm build && pnpm zip
pnpm volc:check    # 真实火山：API 测试 + 样例
pnpm volc:bench    # 单段 / 16 段批量延迟
pnpm volc:e2e      # 扩展端到端（真实火山）
```

- 系统 Google Chrome 145 已禁用 `--load-extension`，冒烟用 Playwright 缓存里的 Chrome for Testing：
  `/root/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`，可用 `CHROME_BIN` 覆盖。
- `pnpm smoke` 会自动起 fixture（8125）与本地 mock AI（8126）。

## 关键实现决策（改代码前先看）

1. **块级渲染**：译文是原文块（p/li/h1-6/td…）的 sibling，不重写原 DOM；`replace` 模式才替换内容并记 `data-tf-original`。
2. **区块级取色**：每块按祖先背景采样 palette，深色区块用亮色译文；对比度 ≥4.5:1。
3. **Shadow DOM**：气泡/环境条/Toast 在 closed shadow 内，站点样式无法污染；自动化也读不到内部，只能人工验证视觉。
4. **缓存**：`tf:cache:provider:from:to:hash(text)`，`chrome.storage.local`，30 天 TTL；整页 bulk 读取。
5. **批量**：12 段 / 4000 字符一批，并发 2，限流 120ms；火山单请求上限 16 段 / 5000 字符。
6. **火山签名**：只签 `x-content-sha256;x-date`（**不要**加 content-type/host），已对齐官方 SDK 固定向量 `de0fdac4…c790c4fa`；改签名必须跑 `tests/unit/volc-sign.test.ts`。
7. **术语表**：发送前把 `原文` 换成 `[[G0]]`，返回后还原为目标词；缓存键用未保护的原文。
8. **测试环境**：DOM 测试用 happy-dom；`collector.test.ts`/`theme.test.ts`/`blocks.test.ts` 文件头有 `@vitest-environment happy-dom`。

## 真实渠道状态

- **火山引擎：已验证**。`pnpm volc:check` 成功；`volc:e2e` 首段 875ms、整页 877ms（7 段 fixture，本机经代理，国内直连应更快）。
- 密钥文件：`~/.secrets/volc.env`（600），**绝不入库、不写文档、不进截图**。
- **百度：只做了签名/错误码契约测试**，没有真实 key，未跑真实调用。
- OpenAI 兼容：用本地 mock（8126）做过 429 / 慢响应取消测试。

## 已知限制（不是 bug）

- `all_frames: false`，跨域 iframe 不翻译。
- 没有自动翻译（`page.autoTranslate` 字段存在但未接 UI/逻辑）。
- PDF、EPUB、YouTube 字幕、图片/漫画未实现（v1.1 以后）。
- 快捷键/气泡视觉、商店截图仍需人工验证。

## 发布状态与下一步

- **GitHub**：已发布 <https://github.com/shixiuhai/transflow>；Release <https://github.com/shixiuhai/transflow/releases/tag/v1.0.0>；默认分支 main，commit 邮箱 `shixiuhai@shixiuhai.serv00.net`。
- **Chrome Web Store**：需开发者账号（一次性 $5）、隐私政策 URL、≥1 张 1280×800 或 640×400 截图、权限用途说明；`<all_urls>` 会被重点审核。材料清单见 `docs/STORE.md`。
- 可直接安装：加载 `.output/chrome-mv3`，或分发 `.output/transflow-1.0.0-chrome.zip`。

## 单词本同步（v1.4.0）

- 扩展：`src/core/vocab/{store,sync,types}.ts`；气泡/弹窗「＋单词本」；设置页单词本卡片；默认 6h `chrome.alarms`。
- 后端：platform-wx `modules/transflow`；`https://transflow.yizhiweb.top/transflow/{health,vocab/sync,vocab}`；JSON 文件 `/home/static/file/upload/transflow/<uuid>.json`。
- 部署：Cloudflare A 灰云 → VPS `/etc/nginx/conf.d/transflow.conf` → frps 8080 → 129 `[ubuntu-server-yizhi-transflow]` → 248:8088 `/wx`。
- 旧 `chromeCrx`/`democontroller`/`DemoController` 已删除；生产 jar 已更新（2026-11-25）。

## 不要做的事

- 不要把 AK/SK、`.env`、Chrome profile 提交进仓库。
- 不要复制 GPL/AGPL 项目（KISS / Read Frog / FluentRead / BabelDOC）的代码。
- 不要用系统 Chrome 做扩展冒烟（145 已禁用 --load-extension）。
