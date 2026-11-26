# 官方用量 / 消费查询

> 状态：v1.10.0（2026-11-26）
> 范围：火山引擎、OpenAI 官方、DeepSeek、百度/GLM/Qwen 的限制说明

## 1. 支持矩阵

| 渠道 | 官方数据 | 接口 | 真实性 |
|---|---|---|---|
| 火山引擎 | 账户本月实付、机器翻译计费、产品明细 | 费用中心 `ListBillOverviewByProd` | **官方账单** |
| OpenAI 官方 | 本月输入/输出 token、请求数、费用 | `GET /v1/organization/usage/completions` + `/v1/organization/costs` | **官方用量/费用**（需 Admin key） |
| DeepSeek | 账户余额（充值/赠金） | `GET https://api.deepseek.com/user/balance` | **官方余额**（非月度用量） |
| 百度翻译 | 无 | 开放平台未提供用量/消费 API | 只能本机统计 |
| GLM / Qwen / 其他兼容 | 取决于服务商 | 未统一开放 | 扩展不猜测，提示去控制台 |

本机字符数仍是 `tf:usage` 本地统计；官方数据只在上方面板展示。

## 2. 火山引擎

- Endpoint：`https://billing.volcengineapi.com`
- Service：`billing`，Region：`cn-north-1`
- Action：`ListBillOverviewByProd`，Version：`2022-01-01`
- 签名：V4（`x-content-sha256` / `x-date`）
- Query：`Action` / `Version`；Body：`BillPeriod` / `Limit` / `Offset` / `NeedRecordNum` / `IgnoreZero`
- 返回：`Result.List[]`（`ProductZh`、`PayableAmount`、`Currency`）

权限：`BillingCenterReadOnlyAccess`（费用中心全部只读）。
参考：[费用中心权限管理](https://docs.volcengine.com/docs/BillingCenter/Permissionmanagement?lang=zh)

限制：

- 账单延迟 1–4 小时。
- 只含已计费产品；免费额度内的翻译不会出现在账单。
- 账户实付含账号下其它火山产品，UI 单独列出“机器翻译”行。
- 火山没有公开“按字符查询本月翻译用量”的 OpenAPI。

## 3. OpenAI 官方

Base URL 必须是 `https://api.openai.com/...`（不是 DeepSeek/GLM 代理）。

接口：

```
GET https://api.openai.com/v1/organization/usage/completions
  ?start_time=<本月 1 日 UTC 秒>&end_time=<now>&bucket_width=1d&limit=31

GET https://api.openai.com/v1/organization/costs
  ?start_time=...&end_time=...&bucket_width=1d&limit=31
```

认证：`Authorization: Bearer <Admin key>`。

- 需要 **组织管理员 Admin key**（`sk-admin_…`），普通项目 key 返回 401/403。
- 用量按 UTC 自然月汇总；费用可能因权限/账期延迟为空。
- 参考：[OpenAI Organization Usage](https://developers.openai.com/api/reference/cli/resources/admin/subresources/organization/subresources/usage/methods/completions)

## 4. DeepSeek

```
GET https://api.deepseek.com/user/balance
Authorization: Bearer <API key>
```

返回 `balance_infos[]`（CNY/USD、total/granted/topped_up）。这是**官方余额**，不是月度用量；DeepSeek 未公开 usage API。

参考：[DeepSeek Get User Balance](https://api-docs.deepseek.com/api/get-user-balance/)

## 5. 百度 / GLM / Qwen

- 百度翻译开放平台没有公开的用量/消费查询 API；只保留本机字符统计。
- GLM、Qwen 等 OpenAI 兼容端点没有统一 usage API；扩展不会把 key 发到非对应厂商的接口。
- 如果后续服务商开放，按 `src/core/usage/openai.ts` 的模式接。

## 6. 安全

- key 只存 `chrome.storage.local`，只发往对应官方域名：
  - 火山：`billing.volcengineapi.com`
  - OpenAI：`api.openai.com`
  - DeepSeek：`api.deepseek.com`
- 不经过 TransFlow 自建服务器。
- 查询结果只存组件内存，不写日志。

## 7. 验证

- 火山真实 AK：HTTP 200，账户实付 ¥8.19，机器翻译暂无计费（免费额度内）。
- 单元测试：火山账单解析、OpenAI token/cost 解析、DeepSeek 余额解析（51 项总）。
- 扩展内点击查询成功，无 CORS 问题。
