# 贡献指南

感谢参与 TransFlow。提交 PR 前请确认：

1. `pnpm typecheck`、`pnpm test`、`pnpm build` 全部通过。
2. 不提交任何密钥、`.env`、个人配置。
3. 新增渠道：在 `src/core/provider/adapters/` 实现 `TranslationProvider`，在 `registry.ts` 注册，补一个带 fixture 的契约测试（200/401/429/超时）。
4. 新增 UI：复用 `src/ui/tokens.css` 的 token，不引入 UI 组件库。
5. 不复制 GPL/AGPL 项目的代码；参考行为可以，代码必须重写。

## 本地开发

```bash
pnpm install
pnpm dev
pnpm test
pnpm smoke   # 需要 Chrome for Testing
```

## 提交信息

使用 `feat: / fix: / docs: / test: / chore:` 前缀，尽量一句话说清改动。

## 许可

贡献的代码默认以 MIT 许可发布。
