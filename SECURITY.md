# 安全

## 报告问题

请通过 GitHub Security Advisory 私下报告，不要在公开 Issue 里贴密钥、账号或可复现的敏感数据。

## 密钥处理

- API 密钥只保存在 `chrome.storage.local`，不上传、不写日志。
- 命令行自检从 `~/.secrets/volc.env` 读取；仓库 `.gitignore` 已排除 `.env*`。
- 如果怀疑密钥泄露，立即在对应云控制台轮换。

## 权限

扩展申请 `storage / activeTab / scripting / contextMenus` 与 `<all_urls>` 主机权限，用于在任意页面注入翻译 UI。没有遥测、没有自建服务器。
