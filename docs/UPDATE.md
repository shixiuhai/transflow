# 本地安装与更新（稳定扩展 ID）

## 为什么之前会变成两个扩展

Chrome 的扩展 ID 来自清单里的公钥；如果清单没有 `key`，未打包扩展的 ID 由**文件夹绝对路径**推导。换一个目录加载，就会被当成一个新扩展。

从 v1.2.0 起清单里写入了固定公钥，因此 ID 固定为：

```
hpdlgjmoidbdidccpkhjpbgkepgonlja
```

## 一次性迁移

旧版本（ID `dnagmhgkkpkkockmdjolegbaamkbbcob`）是路径推导的，无法用新密钥“原地更新”。需要做一次：

1. 打开 `chrome://extensions`，移除旧的「译流 TransFlow」。
2. 开启开发者模式，把 `.output/transflow-1.2.0.crx` 拖进页面。
   - 如果 Chrome 拒绝离线 CRX：用 `google-chrome --enable-easy-off-store-extension-install` 启动，或改为“加载已解压的扩展程序”选择固定目录。
3. 确认新扩展 ID 是 `hpdlgjmoidbdidccpkhjpbgkepgonlja`。

之后每次发版，用同一密钥打包：

```bash
pnpm pack:crx   # 输出 .output/transflow-<version>.crx
```

把新 CRX 拖进 `chrome://extensions`，Chrome 会识别为同一 ID 并更新，不会再出现两个。

## 私钥

- 位置：`~/.secrets/transflow-extension.pem`（600），**不要提交、不要丢失**。
- 丢失后无法再签出同一个 ID，只能重新安装并再次迁移。
- 公钥在 `wxt.config.ts` 的 `manifest.key` 中（可以公开）。

## Chrome 应用商店

商店条目的扩展 ID 由首次上传的包决定；如果后续上传带 `key` 的包被拒绝（key 不匹配），需要为商店单独构建一个**不带 key** 的 zip。当前草稿里的 1.0.0 是旧 ID，上传 1.2.0 时先确认这一点。
