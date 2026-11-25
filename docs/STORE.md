# 上架清单（Chrome Web Store / Edge）

## 当前状态

- 已发布 GitHub：<https://github.com/shixiuhai/transflow>，Release 附 zip。
- **尚未注册开发者账号、尚未提交**；Chrome 开发者控制台已打开待登录。
- 公开隐私政策：<https://shixiuhai.github.io/transflow/privacy.html>（GitHub Pages，若 404 等 1–2 分钟构建）。

## Chrome Web Store 硬性要求（2026-11 核对）

| 项 | 要求 | 我们是否具备 |
|---|---|---|
| 开发者账号 | Google 账号 + 一次性 **$5**（最多 20 个扩展）+ 验证邮箱 | ❌ 需你注册 |
| Manifest | 仅接受 MV3 | ✅ MV3 |
| 包 | 构建产物 zip | ✅ `.output/transflow-1.0.0-chrome.zip` |
| 图标 | 128×128 PNG | ✅ `public/icon/128.png` |
| 截图 | ≥1 张，**1280×800 或 640×400** PNG/JPEG | ⚠️ 需生成（见下） |
| 隐私政策 | 有权限/处理用户数据时必需，公开可访问 URL | ⚠️ `docs/privacy.html` 待托管 |
| 权限说明 | 每个敏感权限的用途 | ✅ 见下 |
| 可选 management | 仅用于检测并移除旧版本；用户点击后才申请 | ✅ 已在设置页说明 |
| 单一用途 | 一句话说清 | ✅ “网页双语翻译” |
| 审核 | 1–3 个工作日，宽权限更久 | — |

参考：注册页 <https://developer.chrome.com/docs/webstore/register>；政策 <https://developer.chrome.com/docs/webstore/program-policies/>；控制台 <https://chrome.google.com/webstore/devconsole>。

## 权限用途文案（可直接粘）

- `storage`：保存用户自己的渠道密钥、语言偏好、术语表与本地缓存。
- `activeTab` / `scripting`：用户点击扩展或快捷键时，在当前页面注入翻译 UI。
- `contextMenus`：提供“翻译选中文本 / 翻译整页 / 还原原文”。
- `<all_urls>`：翻译需要读取任意网页的可见文本；扩展不收集浏览历史、不上传页面数据。
- 远程调用：只向用户在设置中选择的翻译渠道（火山引擎/百度/OpenAI 兼容）发送待翻译文本。

## 隐私披露要点

- 不收集遥测、无账号、无自建服务器。
- 待翻译文本会发送到用户选择的第三方渠道；密钥仅存本机 `chrome.storage.local`。
- 缓存仅存本机 IndexedDB/扩展存储，可清空。

## 还需要准备

1. 公开仓库与 Release（让审核/用户能看到源码）。
2. 托管隐私政策：开启 GitHub Pages 后 `https://<user>.github.io/transflow/privacy.html`。
3. 2–3 张 1280×800 截图：整页双语、划词气泡、设置/向导。
4. 商店文案（中/英，短描述 ≤132 字符）。
5. 分类：Productivity；语言：中文（简体）+ English。

## Edge Add-ons

- 免费，流程类似，使用同一 zip；控制台 <https://partner.microsoft.com/dashboard/microsoftedge/>。
- 审核通常 1–7 天；同样需要隐私政策与权限说明。

## Firefox

- 需要额外适配（`browser.*` polyfill、MV3 差异、`wxt -b firefox` 构建），当前未做。

## 审核风险

- `<all_urls>` + 内容脚本注入所有页面：需在描述与隐私页明确“只读当前页可见文本，不采集浏览行为”。
- 用户自带 API key：不得代收费用、不得隐藏第三方数据传输。
- 不得远程加载代码：我们全部打包，符合。
