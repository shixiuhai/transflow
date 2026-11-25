# 发布清单

## 版本

- 版本号写入 `package.json`，WXT 自动同步到 manifest（Chrome 只接受 1–4 段数字，不能用 `-rc`）。
- 更新 `CHANGELOG.md`。

## 构建

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm zip
```

产物：`.output/transflow-<version>-chrome.zip`，目标 <800KB，无 sourcemap、无 `.env`、无密钥。

## 商店提交

- Chrome Web Store / Edge Add-ons 需要：图标 128、截图、隐私政策 URL、权限用途说明。
- `<all_urls>` 用于任意页面注入，需在描述里说明；不得远程加载代码。
- 上传后先用未打包目录做一次手动安装验证。

## 发布后

- Git tag `vX.Y.Z`，Release 附 zip 与 SHA256。
- 在 README 更新下载链接。
- 记录当次冒烟与性能结果。
