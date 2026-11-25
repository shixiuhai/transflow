# TransFlow 单词本 + 同步服务重构 · 需求与设计

> 状态：需求评审稿（未动代码）
> 日期：2026-11-25
> 范围：Chrome 扩展 TransFlow v1.4.0 + platform-wx 后端 transflow 模块 + Cloudflare/FRP 部署
> 目标：先确认需求与边界，再执行删除/新增/发布。

---

## 1. 背景与目标

### 1.1 用户价值

- 阅读英文网页时，划词得到译文后可以一键把**词或句子**收进单词本。
- 单词本跨设备可用：扩展首次使用生成一个 UUID，用户在另一台设备输入 UUID 即可恢复并合并。
- 数据可导出，不被锁死；不需要注册账号。

### 1.2 工程目标

- 后端把历史 `chromeCrx` 模块整体替换为 `transflow` 模块，接口按 UUID 隔离。
- 存储先用 **JSON 文件**，不引入数据库；保证并发安全、原子写、可备份。
- 域名 `transflow.yizhiweb.top` 走 Cloudflare DNS + VPS nginx + FRP 到 248 后端。
- 删除 `chromeCrx` 与注释掉的 `DemoController`，清理 Shiro 白名单。

### 1.3 非目标

- 不做账号体系、社交/共享词库、服务端搜索。
- 不做数据库、分库分表、消息队列。
- 不在 v1.4.0 做 SRS 复习算法（只预留字段）。

---

## 2. 现状审计

### 2.1 待删除代码

| 路径 | 内容 | 处理 |
|---|---|---|
| `src/main/java/com/walk/platform/modules/chromeCrx/` | 5 个文件：TranslationController、EnglishStudyCrxController、TranslationUtil、LangType、SiteInfoExportExcelDto | 整目录删除 |
| `src/main/java/com/walk/platform/modules/MedicalAssist/controller/DemoController.java` | 全部代码被注释 | 删除文件 |
| `ShiroConfig.java` | `/chrome/crx/**` 白名单 | 替换为 `/transflow/**` |

仓库内检索 `chromeCrx` / `/chrome/crx` / `TranslationUtil` 只命中本模块与 Shiro；未发现前端或其他 Java 代码引用。`DemoController` 已整体注释，删除不影响编译。

### 2.2 旧接口的问题

| 问题 | 说明 | 新方案 |
|---|---|---|
| `userId` 直接拼文件名 | `userId=../../x` 可路径穿越 | 严格 UUID v4 正则 + 固定父目录校验 |
| 无认证 | 知道 userId 就能读写 | UUID 作为 bearer，128 位随机；不提供枚举接口 |
| `/sync/list` 泄露全部用户 | 返回所有文件名/大小/时间 | 删除，不再提供 |
| 写入非原子 | `Files.write` 直接覆盖，并发/断电会坏文件 | 临时文件 + `ATOMIC_MOVE`，按 UUID 加锁 |
| 空单词本不能上传 | `wordbook.isEmpty()` 直接拒绝 | 允许空快照，支持删除同步 |
| 无大小/条数限制 | 可传超大 JSON | 2MB / 5000 条 / 字段长度限制 |
| 目录硬编码 | `/home/static/file/upload/crx` | 配置项 `transflow.storage.dir` |
| 旧翻译接口指向本地部署 | `192.168.6.248:5000`、`10.10.10.8:5000` 的 LibreTranslate | 删除；扩展继续用火山/百度/OpenAI 自带 key |

> 结论：旧模块不是“改造”，而是**删除重写**。旧词库文件（`<userId>_wordbook.json`）与新 UUID 格式不兼容，默认不自动迁移；如需要可另做一次性导入脚本。

### 2.3 旧接口 → 新接口

| 旧接口 | 新接口 | 备注 |
|---|---|---|
| `GET /chrome/crx/translate` | 删除 | 扩展改为直连渠道 |
| `GET /chrome/crx/phonetics` | 删除（v1.1 可选恢复） | 词典发音非核心 |
| `POST /chrome/crx/sync/upload` | `POST /transflow/vocab/sync` | 全量合并，不只上传 |
| `GET /chrome/crx/sync/download` | `POST /transflow/vocab/sync`（空本地） | 恢复 UUID |
| `GET /chrome/crx/sync/delete` | `DELETE /transflow/vocab` | 改 DELETE，UUID 走 header |
| `GET /chrome/crx/sync/list` | **不提供** | 旧接口泄露全部用户 |
| `POST /translate/text` | 删除 | 旧 TranslationUtil |
| `POST /translate/translateText` | 删除 | 旧 LibreTranslate 兼容层 |

---

## 3. 产品需求（单词本）

### 3.1 用户故事

1. 我在英文网页选中一句话，按 `t` 弹出气泡，点「＋单词本」→ 提示“已加入”，重复点击提示“已在单词本”。
2. 我在扩展弹窗里翻译一段文本，点「加入单词本」。
3. 我打开设置 → 单词本：搜索、删除、清空、导出 JSON/CSV。
4. 我换电脑：设置 → 单词本 → 输入旧 UUID → 恢复；本地与云端合并。
5. 我点「同步」：显示“已同步 N 条 / 上次同步时间”。
6. 我离线添加：本地立即可用，联网后自动/手动同步。

### 3.2 功能优先级

**P0（v1.4.0）**

- 气泡内「＋单词本」按钮（保存选中原文 + 译文 + 语言 + 页面 URL/标题 + 时间）。
- 弹窗结果区「加入单词本」按钮。
- 本地词库：新增/去重/删除/清空/搜索。
- 设置页「单词本」区块：列表、UUID 展示/复制、输入 UUID 恢复、手动同步、同步状态。
- 导出 JSON / CSV；导入 JSON（用于备份/UUID 丢失）。
- **自动同步：默认每 6 小时一次**（`chrome.alarms`），设置页可改为 1h/6h/12h/24h 或关闭；随时可点「立即同步」。
- UUID 轮换（生成新 UUID 并上传当前词库；旧 UUID 数据保留，提供「删除云端旧数据」说明）。

**P1（后续）**

- 编辑笔记/标签、掌握度、SRS 复习、按域名筛选、全文翻译段落 hover 加入、发音（词典 API）。

**明确不做**

- 账号登录、共享词库、服务端全文搜索、数据库。

### 3.3 本地数据模型

```ts
interface VocabItem {
  id: string;              // 条目 UUID
  term: string;            // 选中原文（词或句）
  translation: string;     // 译文
  sourceLang: string;      // en / auto
  targetLang: string;      // zh
  context?: string;        // 所在句子（可选，便于复习）
  url?: string;
  title?: string;
  note?: string;
  tags?: string[];
  createdAt: number;       // ms
  updatedAt: number;       // ms
  // 预留：mastery?: 0-5; reviewCount?: number; lastReviewedAt?: number;
}

interface VocabState {
  version: 1;
  uuid: string;            // crypto.randomUUID()
  items: VocabItem[];
  updatedAt: number;
  sync: {
    lastSyncAt: number;
    lastError?: string;
    auto: boolean;              // 默认 true
    intervalMinutes: number;    // 默认 360（6h）
    nextSyncAt?: number;
  };
}
```

存储：

- 主键：`tf:vocab:v1`（`chrome.storage.local`）。
- UUID 同时写入 `tf:vocab:uuid`，便于恢复/诊断。
- 去重键：`normalize(term) + '|' + sourceLang + '|' + targetLang`；重复时更新译文/updatedAt，不新增。
- 容量：最多 5000 条；超过提示导出/清理。扩展存储 10MB，词库 JSON 预计 <2MB。

### 3.4 交互细节

**气泡**

- 按钮顺序建议：`＋单词本` · `朗读原文` · `朗读译文` · `复制` · `关闭`。
- 状态：默认「＋单词本」；点击后变「已加入」（禁用 1.5s 或保持到关闭）。
- 重复：toast「已在单词本」；不新增。
- 无译文/加载中：按钮禁用。
- 保存内容：选中文本、译文、目标语言、当前 URL/标题；上下文取选区所在段落（截断 500 字）。

**弹窗**

- 结果区操作行新增「加入单词本」，与「复制/朗读」同级。
- 未配置 UUID 时首次加入自动生成并提示“已创建词库 UUID，可在设置中查看/备份”。

**设置页**

新增「单词本」卡片（放在「术语表」之后）：

```
单词本
UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  [复制] [生成新的]
[输入 UUID 恢复] [恢复]
[立即同步] 上次同步：2026-11-25 22:10 · 成功 12 条
自动同步 [开关]  频率 [每 6 小时 ▾]（1h / 6h / 12h / 24h / 仅手动）
搜索 [____]  共 42 条   [导出 JSON] [导出 CSV] [导入] [清空]
列表：term / translation / 时间 / 删除
```

- 恢复流程：输入 UUID → 校验格式 → 拉取云端 → 与本地合并 → 展示“合并后 N 条（新增 X，更新 Y）”。
- UUID 丢失：只能靠导出文件；UI 明确警告。
- 清空：二次确认，同时清空本地与服务端（可选只清本地）。

### 3.5 UUID 规则

- 客户端 `crypto.randomUUID()` 生成 v4。
- 服务端只接受 `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`。
- UUID 是唯一凭证：**泄露 = 词库泄露**；UI 提示不要截图/公开。
- 不做 UUID 猜测防护以外的账号校验；依赖 128 位随机性 + 限流。

---

## 4. 同步协议

### 4.1 接口

Base：`https://transflow.yizhiweb.top/transflow`（nginx 重写到后端 `/wx/transflow`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，无需 UUID |
| POST | `/vocab/sync` | 合并并返回全量快照 |
| DELETE | `/vocab` | 删除该 UUID 的服务端词库 |

请求头：

```
X-Transflow-Id: <uuid>
Content-Type: application/json
X-Client-Version: transflow-extension/1.4.0
```

`POST /vocab/sync` 请求：

```json
{
  "protocol": 1,
  "lastSyncAt": 0,
  "items": [ { "id": "...", "term": "serendipity", "translation": "意外发现", "sourceLang": "en", "targetLang": "zh", "createdAt": 1790000000000, "updatedAt": 1790000000000 } ],
  "deleted": { "1b2c...": 1790000000000 }
}
```

响应：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "protocol": 1,
    "revision": 12,
    "serverTime": 1790000000000,
    "items": [ ... ],
    "deleted": { ... }
  }
}
```

状态码：`200` 成功；`400` UUID/JSON/字段非法；`413` 超过 2MB 或 5000 条；`429` 限流；`500` 存储错误。

### 4.2 合并规则（服务端执行）

1. 读取服务端文件（不存在视为空文档）。
2. 合并墓碑：`deleted[id] = max(server, client)`。
3. 合并条目：按 `id` 取 `updatedAt` 较大者；`term/translation` 等字段整体覆盖。
4. 应用墓碑：若 `deleted[id] >= item.updatedAt`，删除该条。
5. 时间戳相同：服务端优先（避免客户端时钟回拨反复覆盖）。
6. `revision += 1`；返回合并后的全量。
7. 墓碑保留 90 天，之后清理；文件超过 5000 条返回 413（客户端先裁剪/导出）。

### 4.3 客户端同步状态机

```
idle → syncing → success (lastSyncAt)
             ├→ offline（保留 dirty，网络恢复重试）
             ├→ 400（UUID 非法：提示恢复/重置）
             ├→ 413（提示导出后清理）
             └→ 5xx（指数退避 1s/4s/10s，最多 3 次）
```

- 本地永远是权威副本；同步失败不丢数据。
- 添加/删除后只标记 `dirty`，**不立即请求**；等下一次 6h 定时或用户点「立即同步」。
- 恢复 UUID：立即拉取一次（空本地 + 远端合并），成功后写入本地。
- 浏览器启动：若 `now - lastSyncAt >= intervalMinutes`，30 秒后补一次。
- 网络恢复（`online`）：若 `dirty` 且上次失败，立即重试一次。
- 定时与手动互斥：同步中再次触发直接复用同一 Promise，不并发写。

### 4.4 安全与隐私

- HTTPS（泛域名证书）；UUID 只放请求头，避免进 nginx access log 的 query。
- 服务端不记录词条正文到日志；错误日志只记 UUID 前 8 位与异常类型。
- 禁止 `GET /vocab/list` 类接口；不提供跨 UUID 查询。
- 路径穿越：UUID 正则 + `Path.normalize` + `startsWith(baseDir)` 双重校验。
- 文件权限 600；目录 700；原子写 + 每日备份（可选 cron）。
- 限流：nginx `limit_req` 30r/s burst 60（按 IP），后端再按 UUID 60 次/分钟。
- CORS：仅允许 `chrome-extension://*`、`https://transflow.yizhiweb.top`、`http://localhost:*`；`allowCredentials=false`。

### 4.5 存储实现

```
/home/static/file/upload/transflow/<uuid>.json   # 600
/home/static/file/upload/transflow/.tmp/         # 临时文件
/home/static/file/upload/transflow/backup/       # 可选每日副本
```

- 配置：`transflow.storage.dir`，默认 `${fileUpload.prefixPath}/transflow`。
- 写：`Files.write(tmp)` → `Files.move(tmp, target, ATOMIC_MOVE, REPLACE_EXISTING)`。
- 锁：`ConcurrentHashMap<String, ReentrantLock>`，按 UUID 串行；完成后可清理空闲锁。
- 读取损坏 JSON：返回 500 并保留 `.corrupt-<ts>` 副本，不覆盖。

---

## 5. 后端重构方案（platform-wx）

### 5.1 删除清单

```
src/main/java/com/walk/platform/modules/chromeCrx/                 # 整个目录
src/main/java/com/walk/platform/modules/MedicalAssist/controller/DemoController.java
ShiroConfig.java: filterMap.put("/chrome/crx/**","anon");
```

编译前检索确认无引用；删除后 `mvn -q -DskipTests compile`。

### 5.2 新模块

```
src/main/java/com/walk/platform/modules/transflow/
  controller/TransflowVocabController.java
  service/TransflowVocabService.java
  service/VocabFileStore.java
  dto/VocabItem.java
  dto/VocabDocument.java
  dto/VocabSyncRequest.java
  dto/VocabSyncResponse.java
  config/TransflowProperties.java
  config/TransflowCorsConfig.java
  support/TransflowIds.java          # UUID 校验/规范化
```

- 控制器：`@RestController @RequestMapping("/transflow")`，`@Tag(name="TransFlow 单词本")`。
- 返回：沿用项目 `R`（`{code,msg,data}`）；客户端取 `data`。
- 服务：合并逻辑、限流、字段校验。
- 存储：`ObjectMapper` + 原子写 + 锁。
- 配置：

```yaml
transflow:
  storage:
    dir: /home/static/file/upload/transflow
  max-items: 5000
  max-body-bytes: 2097152
  rate-limit-per-minute: 60
  tombstone-days: 90
```

### 5.3 Shiro

```java
filterMap.put("/transflow/**", "anon"); // UUID 在控制器内校验
```

删除 `/chrome/crx/**`。放在 `/**` 兜底之前。

### 5.4 CORS

`CorsConfig` 当前被注释，不要全局开启。新增 `TransflowCorsConfig` 仅对 `/transflow/**`：

```java
registry.addMapping("/transflow/**")
  .allowedOriginPatterns("chrome-extension://*", "https://transflow.yizhiweb.top", "http://localhost:*")
  .allowedMethods("GET","POST","DELETE","OPTIONS")
  .allowedHeaders("*")
  .allowCredentials(false)
  .maxAge(3600);
```

### 5.5 测试

- 单元：UUID 校验（路径穿越/大小写/非 v4）、合并（新增/更新/墓碑/时钟相同）、原子写、超限。
- MockMvc：health、sync 200/400/413、delete、CORS preflight。
- 并发：同一 UUID 20 线程 sync，最终条数正确、JSON 可解析。
- 手工 curl（见 §6.4）。

---

## 6. 域名与部署

### 6.1 现状链路（来自本机记忆）

```
浏览器 :443 → VPS 14.102.238.173 nginx → 127.0.0.1:8080 frps
            → frpc(192.168.6.129) → 192.168.6.248:<port>
```

- 泛域名证书：`/root/.acme.sh/yizhiweb.top_ecc/`，新子域无需再签。
- VPS nginx 站点模板：`config/nginx/vps/tv.conf`（80 ACME + 301，443 反代 8080）。
- 129 是唯一 frpc 客户端；配置 `/root/frp/frpc.ini`（以线上为准）。
- 后端生产端口 8088，context-path `/wx`。

### 6.2 Cloudflare DNS

- Zone：`yizhiweb.top`；凭据：`/root/.cf/credentials`（含 `API_TOKEN`，需确认有 `Zone.DNS Edit`）。
- 记录：`A transflow 14.102.238.173`，**Proxied = DNS only（灰云）**，TTL Auto。
- 灰云原因：保留真实客户端 IP 给限流；与现有 API 子域一致。
- 验证：`dig +short transflow.yizhiweb.top` → `14.102.238.173`。

### 6.3 VPS nginx

新增 `/etc/nginx/conf.d/transflow.conf`（仿 `tv.conf`）：

```nginx
server {
  listen 80;
  server_name transflow.yizhiweb.top;
  include /etc/nginx/snippets/acme-challenge.conf;
  location / { return 301 https://$host$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name transflow.yizhiweb.top;
  ssl_certificate     /root/.acme.sh/yizhiweb.top_ecc/fullchain.cer;
  ssl_certificate_key /root/.acme.sh/yizhiweb.top_ecc/yizhiweb.top.key;
  client_max_body_size 3m;
  location / {
    proxy_pass http://127.0.0.1:8080/wx/;   # 去掉 /wx 前缀差异
    proxy_set_header Host transflow.yizhiweb.top;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 30s;
  }
}
```

> `proxy_pass ... /wx/` 会把 `/transflow/health` 变成 `/wx/transflow/health`，匹配后端 context-path。

### 6.4 FRPC（129）

在 `/root/frp/frpc.ini` 追加：

```ini
[ubuntu-server-yizhi-transflow]
type = http
local_ip = 192.168.6.248
local_port = 8088
custom_domains = transflow.yizhiweb.top
```

重启 frpc（只能有一个进程），然后验证：

```bash
# VPS 本机
curl -s http://127.0.0.1:8080/transflow/health -H 'Host: transflow.yizhiweb.top'
# 公网
curl -sS https://transflow.yizhiweb.top/transflow/health
```

期望：`{"code":200,...,"data":{"ok":true,...}}`。

### 6.5 权限与回滚

- 改 nginx 前 `nginx -t`；保留 `.bak`。
- 改 frpc 前备份 `frpc.ini`；失败恢复旧文件并重启。
- DNS 可先 TTL 60 验证，再改回 Auto。
- 回滚：删除 nginx 站点、删除 frpc 段、删除 DNS 记录。

---

## 7. 扩展改造方案

### 7.1 新模块

```
src/core/vocab/
  types.ts        VocabItem / VocabState
  store.ts        local load/save/dedupe/search/export
  uuid.ts         generate/validate/restore
  merge.ts        客户端合并（与服务端同规则）
  sync.ts         fetch /transflow/vocab/sync，重试/超时
```

### 7.2 清单与权限

- `manifest.json` 新增 `alarms` 权限（定时同步）。
- CWS 权限说明补充：`alarms` 仅用于每 6 小时同步一次单词本，不用于后台追踪。
- 不新增 `tabs` 等额外权限；同步由 background 发起，沿用现有 host 权限。

### 7.3 设置扩展

```ts
vocab: {
  enabled: boolean;              // 默认 true
  autoSync: boolean;             // 默认 true
  syncIntervalMinutes: number;   // 默认 360（6h），可 60/360/720/1440
  syncUrl: string;               // 默认 https://transflow.yizhiweb.top/transflow
  uuid: string;                  // 懒生成
}
```

### 7.4 UI

- 气泡：新增「＋单词本」按钮，调用 `addVocab({term, translation, ...})`。
- 弹窗：结果操作行新增「加入单词本」。
- 设置：新增「单词本」卡片（见 §3.4），包含同步、恢复、列表、导出。
- Toast：已加入 / 已在单词本 / 同步成功/失败。

### 7.5 同步触发

- **定时**：`chrome.alarms` 创建 `transflow-vocab-sync`，`periodInMinutes = syncIntervalMinutes`（默认 360）。
  - SW 休眠不影响 alarm；alarm 触发时唤醒 SW 执行同步。
  - `onInstalled` / `onStartup` 重新创建 alarm（Chrome 更新可能清空 alarm）。
  - 关闭自动同步 → `chrome.alarms.clear`。
- **手动**：「立即同步」按钮（设置页/弹窗）发送 `sync-now` 消息，忽略定时器立即执行。
- **恢复 UUID**：立即拉取合并。
- **启动补同步**：`onStartup` 时若距上次同步超过间隔，30s 后执行一次。
- **网络恢复**：`online` 且 dirty/上次失败时重试一次。
- 失败不阻塞 UI，状态显示在设置页；下次定时仍按 6h 继续。

### 7.6 测试

- 单元：UUID 校验、去重、合并、墓碑、CSV 导出。
- E2E（mock server）：添加→同步→清空→用 UUID 恢复→断言条数。
- 真实服务：`pnpm vocab:smoke`（curl + 扩展）。
- 冒烟总数目标：30+。

---

## 8. 交付计划

| 阶段 | 内容 | 人日 | 出口 |
|---|---|---|---|
| M0 | 本文档评审、确认决策 | 0.5 | 用户确认 |
| M1 | 删除 chromeCrx/Demo，新增 transflow 模块 + Shiro/CORS + 单测 | 2 | `mvn compile/test` 通过；curl 本地 200 |
| M2 | Cloudflare DNS + VPS nginx + FRPC + 公网 health | 0.5 | `https://transflow.yizhiweb.top/transflow/health` 200 |
| M3 | 扩展本地词库 + 气泡/弹窗按钮 + 设置页列表 | 2 | 本地增删查导可用 |
| M4 | UUID 恢复 + 同步 + 合并 + 6h 定时/手动 + 状态 | 1.5 | 双 profile 恢复/合并通过；alarm 可触发 |
| M5 | 冒烟、文档、v1.4.0 发布 | 0.5 | 30+ 冒烟、zip/crx、Release |

---

## 9. 验收标准

- [ ] 旧 `chromeCrx`、`DemoController` 删除；编译通过；Shiro 无 `/chrome/crx`。
- [ ] `/transflow/health` 公网 200，TLS 严格校验通过。
- [ ] 非法 UUID（`../`、非 v4）返回 400，不落盘。
- [ ] 两个客户端并发同步同一 UUID，无文件损坏、条数正确。
- [ ] 删除条目同步后，另一端不复活（墓碑生效）。
- [ ] 扩展：选中句 → 气泡「＋单词本」→ 设置页可见；重复添加不重复。
- [ ] 设备 A 添加 10 条 → 同步；设备 B 输入 UUID → 恢复 10 条。
- [ ] 离线添加 → 联网后（6h 定时或手动）同步成功。
- [ ] 修改同步频率后，`chrome.alarms` 的下次触发时间随之变化。
- [ ] 导出 JSON/CSV 可重新导入。
- [ ] 词条正文不出现在服务端日志。
- [ ] 冒烟 ≥30 项、单测全绿。

---

## 10. 风险与待确认

### 10.1 风险

| 风险 | 缓解 |
|---|---|
| UUID 丢失 = 词库丢失 | 强制提示导出；设置页显眼展示；可轮换但旧数据需手动删 |
| JSON 文件单点/磁盘故障 | 每日 backup；原子写；文件 600 |
| 删除旧 `/translate/*` 影响未知外部调用 | 仓库内无引用；上线前观察 access log |
| Cloudflare token 权限不足 | 先 `GET /zones?name=yizhiweb.top` 验证；不足则新建 DNS Edit token |
| FRPC 129 无法 SSH（当前公钥拒绝） | 通过现有运维通道/控制台改；不要动 frps |
| 旧词库文件格式不兼容 | 默认不迁移；需要时写一次性导入脚本 |
| CORS 配置过宽 | 仅 `/transflow/**`，不允许 credentials |

### 10.2 需要你确认的决策

1. **同步路径**：`https://transflow.yizhiweb.top/transflow`（nginx 重写，推荐）还是保留 `/wx/transflow`？
2. **自动同步默认**：开（推荐）还是关？
3. **气泡按钮文案/位置**：`＋单词本` 放最前（推荐）还是放复制后面？
4. **旧翻译接口**：确认删除 `/translate/*` 与 `/chrome/crx/translate`（仓库内无引用）？
5. **UUID 轮换**：只换 UUID + 上传当前词库，旧云端数据保留给用户手动删，是否可接受？
6. **旧词库迁移**：是否需要把 `/home/static/file/upload/crx/*_wordbook.json` 导入新格式？
7. **Cloudflare 代理**：灰云直连（推荐，限流真实 IP）还是橙云？
8. **存储目录**：`/home/static/file/upload/transflow` 是否可写、是否有备份盘？

> 以上确认后，按 M1→M5 执行；删除是不可逆操作，会先做 `git` 分支与目录备份。


---

## 11. 决策记录

| 日期 | 决策 | 说明 |
|---|---|---|
| 2026-11-25 | 客户端定时同步默认 **6 小时** | 使用 `chrome.alarms`，可在设置改为 1h/6h/12h/24h/仅手动；保留「立即同步」 |
| 待确认 | 同步路径、旧接口删除、旧词库迁移、UUID 轮换、Cloudflare 代理 | 见 §10.2 |
