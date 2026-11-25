# 渠道接入说明

## 火山引擎（默认）

1. 注册并实名：https://console.volcengine.com/
2. 开通机器翻译：https://console.volcengine.com/mt（开通即送每月前 200 万字符）
3. 建子用户：https://console.volcengine.com/iam/user → 编程访问 → 授权 `TranslateFullAccess` → 创建 AK/SK

接口：

```
POST https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01
Region: cn-north-1, Service: translate
Body: {"SourceLanguage":"en","TargetLanguage":"zh","TextList":["..."]}
限制：TextList ≤16 条，总字符 ≤5000
签名：Volcengine V4（HMAC-SHA256，WebCrypto 在 background 完成）
```

自检：

```bash
printf 'VOLC_AK=%s\nVOLC_SK=%s\n' 'AK' 'SK' > ~/.secrets/volc.env
chmod 600 ~/.secrets/volc.env
pnpm volc:check
```

## 百度翻译

1. 开通通用文本翻译：https://api.fanyi.baidu.com/access/0/1
2. 选「高级版」（每月 100 万字符，QPS 10），拿 APPID 与密钥
3. 设置页 → 百度翻译 → 填入 APPID + 密钥

签名：`md5(appid + q + salt + key)`；单请求单段，客户端并发窗口 4。错误码 54001（签名）、54003（频率）、54004（余额）会转成可读文案。

## OpenAI 兼容

- Base URL 例：`https://api.deepseek.com/v1`
- Model 例：`deepseek-chat`
- 要求 `/chat/completions` 且支持 JSON 输出；失败会自动退化为按行解析。

## 安全

- 密钥只存 `chrome.storage.local`，不写日志、不上传。
- 命令行自检从 `~/.secrets/volc.env` 读取，`.gitignore` 已排除 `.env*`。
- 不要把 AK/SK 提交到仓库或贴到公开 Issue。
