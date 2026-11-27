# 邮箱 / iframe 内划词翻译修复（v1.13.0）

> 现象：Roundcube Webmail（`mail.serv00.com`）邮件正文里选中文字，按 `t` 没有反应。
> 结论：邮件正文在 `iframe#messagecontframe` 内，旧 content script 是 `all_frames: false`，iframe 里根本没有扩展脚本。

---

## 1. 为什么选不中 / 不翻译

Roundcube 的邮件预览结构：

```html
<iframe id="messagecontframe" name="messagecontframe"
        src="skins/serv00/watermark.html" title="邮件预览"></iframe>
```

打开邮件后，正文被加载进这个 iframe，而不是主文档。

旧配置：

```json
{
  "matches": ["<all_urls>"],
  "all_frames": false,
  "run_at": "document_idle"
}
```

导致：

- iframe 内没有 content script；
- `window.getSelection()`、`keydown` 都发生在 iframe 自己的 document；
- 主 frame 的按 `t` 监听收不到；
- 页面翻译/还原也不该在 iframe 里重复执行。

这不是 Roundcube 特殊，所有“正文在 iframe”的邮件/文档/预览页都会这样。

## 2. 修复

### 2.1 content script 进入所有 frame

`content.ts`：

```ts
allFrames: true,
matchAboutBlank: true,
matchOriginAsFallback: true,
```

`keybridge.content.ts` 同样开启，保证 iframe 内的 `t` 也能被 MAIN world 提前捕获。

- 选中 iframe 内文字 → 气泡渲染在 iframe 自己的 fixed layer 上。
- 快捷键、浮标、朗读、加入单词本都在该 frame 内工作。

### 2.2 页面级操作只在主 frame

iframe 里不能重复执行整页翻译/还原：

```ts
if ((message.type === 'page-translate' ||
     message.type === 'page-restore' ||
     message.type === 'page-status') && !isTopFrame) {
  sendResponse({ ok: false, error: { code: 'not_top_frame', ... } });
  return;
}
```

- Popup / 后台发送 `page-*` 时带 `{ frameId: 0 }`。
- 右键菜单“翻译选中文本”带 `info.frameId`，iframe 内右键也能定向。
- 页面翻译只在主 frame 渲染进度条。

### 2.3 为什么用 `matchOriginAsFallback`

Roundcube 某些预览可能是 `about:blank` / `srcdoc` / sandbox 唯一源。  
`matchAboutBlank` + `matchOriginAsFallback` 让这些 frame 也能注入，避免“看起来有 iframe 但扩展没进去”。

## 3. 验证

新增冒烟：

- 父页面嵌入同源 `iframe-child.html`
- 在 iframe 内真实鼠标拖选 47 字符
- 按 `t`
- 断言 iframe 内 `#transflow-root[data-tf-bubble=open]`

结果：

```
PASS selection works inside same-origin iframe (47 chars / true)
35/35 checks passed
```

同时回归：

- 主 frame 划词正常
- 整页翻译/还原正常
- 429 / 慢请求取消正常
- 单词本 / 复习页正常

## 4. 限制

- 如果 iframe 被站点设置为 **禁止脚本的 sandbox**，Chrome 不会注入 content script，扩展无法绕过。
- 跨域 iframe 会各自注入（`<all_urls>`），气泡显示在对应 iframe 内，不会浮到父页面外。
- 邮件正文如果是 PDF 插件/Chrome 内置 viewer，仍属于插件页面，扩展无法注入；可先“在新标签打开”或复制文本。

## 5. 使用

升级 1.13.0 后：

1. 刷新邮箱页面（F5），让新的 content script 进入 iframe。
2. 点开一封邮件，在正文里选中英文。
3. 按 `t`，气泡应出现在选区旁。
4. 若仍无反应，打开扩展弹窗看诊断：页面脚本版本是否为 1.13.0。
