# 官方用量 / 消费查询

> 状态：v1.9.0（2026-11-26）
> 范围：火山引擎官方账单；百度/OpenAI 兼容渠道的限制说明

## 1. 能查到什么

| 数据 | 来源 | 真实性 |
|---|---|---|
| 本机翻译字符数 | `tf:usage` 本地存储 | 本机真实调用量（仅本扩展） |
| 火山账户本月实付 | 火山费用中心 `ListBillOverviewByProd` | **官方账单** |
| 火山机器翻译计费 | 同上，按产品名匹配「翻译/Translate」 | 官方账单行（免费额度内可能没有行） |
| 火山免费额度内字符 | 无公开 API | 只能用本机统计估算 |

## 2. 火山账单接口

- Endpoint：`https://billing.volcengineapi.com`
- Service：`billing`
- Region：`cn-north-1`
- Action：`ListBillOverviewByProd`
- Version：`2022-01-01`
- 签名：V4（复用扩展现有 `signVolcRequest`，只签 `x-content-sha256` / `x-date`）
- 参数：`Action`/`Version` 在 query；`BillPeriod`/`Limit`/`Offset`/`NeedRecordNum`/`IgnoreZero` 在 JSON body
- 返回：`Result.List[]`，每行含 `ProductZh`、`PayableAmount`、`Currency`

实现：`src/core/usage/billing.ts`

## 3. 权限

火山 IAM 给 AK 所属子用户添加系统策略：

```
BillingCenterReadOnlyAccess
```

即「费用中心全部只读权限」，包含费用中心页面和相关 OpenAPI 的查询/导出。

参考：[费用中心权限管理](https://docs.volcengine.com/docs/BillingCenter/Permissionmanagement?lang=zh)

没有权限时，扩展会提示：
> 当前 AK 没有费用中心只读权限。请在火山 IAM 给子用户添加 BillingCenterReadOnlyAccess（费用中心全部只读）后重试。

## 4. 已知限制

- 账单数据延迟 **1–4 小时**，刚调用完不会立刻出现。
- 账单只包含**已计费**产品；200 万字符免费额度内的翻译不会出现在账单里。
- 账户实付包含该账号下所有火山产品（例如 TTS），所以 UI 同时展示：
  - 账户本月实付
  - 机器翻译计费（没有行时显示“暂无计费，可能在免费额度内”）
- 火山没有公开“按字符查询本月翻译用量”的 OpenAPI；字符数仍以本机统计为准。
- 百度翻译开放平台没有公开用量查询 API；OpenAI 兼容渠道取决于服务商是否提供 admin usage API，扩展不强行猜测。

## 5. UI

设置 → 用量：

- 本机字符/渠道分布（原有）
- 「火山引擎官方账单」卡片
  - 查询/刷新按钮
  - 账户本月实付
  - 机器翻译计费
  - 账单产品数 + 可展开明细
  - 延迟/权限说明

## 6. 验证

- 真实 AK 调用返回 200：账户本月实付 `¥8.19`，机器翻译暂无计费（免费额度内）。
- `parseVolcBilling` 单测：账户合计、翻译行、空账单。
- 扩展内实际点击「查询官方账单」成功，无 CORS 问题。
