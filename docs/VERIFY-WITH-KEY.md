# 拿到火山 AK/SK 后的 10 分钟验证

## 1. 写入密钥

```bash
mkdir -p ~/.secrets && chmod 700 ~/.secrets
printf 'VOLC_AK=%s\nVOLC_SK=%s\n' '你的 AK' '你的 SK' > ~/.secrets/volc.env
chmod 600 ~/.secrets/volc.env
```

## 2. 命令行自检

```bash
cd transflow
pnpm volc:check
```

期望：

```
test: { ok: true, latencyMs: <80-400>, detail: '你好世界' }
1: 敏捷的棕色狐狸跳过了懒狗。
2: TransFlow 将原文与译文并排呈现。
```

失败对照：

| 现象 | 原因 |
|---|---|
| `InvalidSignature` | 签名/时钟；确认系统时间准确 |
| `401/403` | 子用户未授权 `TranslateFullAccess`，或服务未开通 |
| `-415` | 语言对不支持 |
| `-429` | 限流，降低并发或稍后重试 |

## 3. 扩展内验证

1. `pnpm build`，加载 `.output/chrome-mv3`。
2. 点击图标 → 设置 → 火山引擎 → 填入 AK/SK → 测试连接（应显示延迟 + “你好世界”）。
3. 打开 `tests/fixtures/article.html`（或任意英文页）→ `Alt+A`。
4. 检查：首段出现时间、译文样式、深色区块配色、环境条进度、还原。
5. 划词 → 气泡；输入框双击空格；`Ctrl+Z` 撤销。

## 4. 记录指标

把以下数据补进 `docs/PERF.md` 的“真实渠道待测”：

- 首段出现（ms）
- 整页 5k 字（s）
- 缓存命中整页（ms）
- 划词 p50（ms）
- 失败率（%）

## 5. 通过标准

- `pnpm volc:check` 成功；
- 扩展“测试连接”成功；
- 真实页面首段 ≤800ms、5k 字整页 ≤4s（国内直连，参考值）；
- 无 `InvalidSignature` / 401。
