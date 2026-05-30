# 思谱 Mindline · API 契约总览

> 前后端对齐的单一事实来源（Single Source of Truth）。汇总自主文档 `../思谱-需求文档.md` §5.8 与四份详设。**本文为契约约定，不含实现**。

| 项 | 内容 |
|----|------|
| 版本 | v0.1 |
| 日期 | 2026-05-30 |
| 关联 | AI拆解详设 / Yjs协同详设 / 权限与过滤详设 / Schema迁移工具详设 |
| 适用 | 前端、后端、联调、测试 |

---

## 1. 通用约定

### 1.1 基础

| 项 | 约定 |
|----|------|
| Base URL | `https://<host>/api`（私有部署为客户域名）；预留版本前缀 `/api/v1` |
| 协议 | REST/JSON over HTTPS；实时协同走 WSS；AI/摘要流式走 SSE |
| 编码 | UTF-8；`Content-Type: application/json`；SSE 为 `text/event-stream` |
| 时间 | 一律 epoch 毫秒（int64），如 `1730000000000` |
| 语言 | 请求可带 `Accept-Language` 或显式 `lang` 字段（默认 zh） |

### 1.2 鉴权与多租户

- 鉴权：`Authorization: Bearer <JWT>`。JWT 声明含 `sub(userId)`、`tenantId`、`role`（全局）、`exp`。
- 多租户：`tenantId` 从 JWT 注入，**不接受**客户端在 body 覆盖；所有数据按 `tenantId` 行级隔离。
- 项目级权限：在 JWT 全局角色之上，按 `project_members.role` 二次校验（矩阵见权限详设 §2）。
- 协同 WS：握手用 `?token=<JWT>`，服务端 `onAuthenticate` 校验后注入 `{userId, tenantId, role}`。

### 1.3 统一错误模型

所有错误响应体：
```jsonc
{ "error": {
    "code": "VALIDATION_ERROR",     // 机器可读枚举（见 1.4）
    "message": "priority 不在允许取值内",
    "details": { "field": "priority" }   // 可选，结构因错误而异
} }
```

### 1.4 全局错误码

| code | HTTP | 含义 |
|------|------|------|
| `UNAUTHENTICATED` | 401 | 无/无效 token |
| `FORBIDDEN` | 403 | 已认证但无权限 |
| `NOT_FOUND` | 404 | 资源不存在或无权感知 |
| `VALIDATION_ERROR` | 400 / 422 | 参数/Schema/DSL 校验失败（422 用于语义校验） |
| `CONFLICT` | 409 | 状态冲突（重复任务、已回滚、乐观锁失败） |
| `RATE_LIMITED` | 429 | 频控；带 `Retry-After` 头 |
| `QUOTA_EXCEEDED` | 429 | AI 额度超限（区别于频控，details.quota） |
| `UPSTREAM_ERROR` | 502 | 模型网关/IM 渠道等上游失败 |
| `TIMEOUT` | 504 | 上游超时 |
| `INTERNAL` | 500 | 服务端错误 |

WS 关闭码：`4401` 未授权 · `4403` 无该 map 权限 · `4404` map 不存在 · `1011` 服务端错误。

### 1.5 分页

游标分页：请求 `?cursor=<opaque>&limit=<1..200>`；响应 `{ "items": [...], "nextCursor": "..."|null }`。

### 1.6 ID 规范（前缀）

| 实体 | 前缀 | 实体 | 前缀 |
|------|------|------|------|
| 租户 | `tn_` | 用户 | `u_` |
| 工作空间 | `ws_` | 项目 | `p_` |
| 思维导图 | `m_` | 节点 | `n_` |
| 变更事件 | `c_` | 批次 | `b_` |
| 里程碑 | `ms_` | IM 渠道 | `ch_` |
| AI 提案 | `prop_` | 迁移 | `mig_` |
| 后台任务 | `job_` | 提案内临时节点 | `t1`（proposal 局部，非持久 ID） |

### 1.7 幂等与并发

- 写操作可带 `Idempotency-Key: <uuid>`（强烈建议用于 transfer/migration/publish）。
- 并发写采用乐观策略：字段批量改仅当现值 == 期望旧值才生效（见 transfer/migration）。

### 1.8 排期标注

每个端点标注所属里程碑 `M0–M6`（含义见主文档 §7）。`MVP = M0–M2`。

### 1.9 契约详尽度标注

- **【完整】**：本文给出完整 req/resp，且在对应详设有时序与说明。
- **【约定】**：为契约自洽补充的标准端点，结构已定、细节随实现微调。

---

## 2. 端点索引

| 模块 | 方法 | 路径 | 权限 | 排期 | 详尽度 |
|------|------|------|------|------|--------|
| 认证 | POST | `/auth/login` | 公开 | M0 | 约定 |
| 认证 | POST | `/auth/refresh` | 公开(refresh token) | M0 | 约定 |
| 认证 | GET | `/me` | 登录 | M0 | 约定 |
| 项目 | GET | `/projects` | 成员 | M0 | 约定 |
| 项目 | POST | `/projects` | 登录 | M0 | 约定 |
| 项目 | GET | `/projects/:id` | Viewer+ | M0 | 约定 |
| 项目 | PATCH | `/projects/:id` | Admin+ | M0 | 约定 |
| 项目 | DELETE | `/projects/:id` | Owner | M0 | 约定 |
| 项目 | GET | `/projects/:id/permissions` | Viewer+ | M3 | 完整 |
| 成员 | GET | `/projects/:id/members` | Viewer+ | M0 | 约定 |
| 成员 | POST | `/projects/:id/members` | Admin+ | M0 | 约定 |
| 成员 | PATCH | `/projects/:id/members/:userId` | Admin+ | M3 | 完整 |
| 成员 | DELETE | `/projects/:id/members/:userId` | Admin+ | M3 | 约定 |
| 节点类型 | GET | `/projects/:id/node-types` | Viewer+ | M0 | 约定 |
| 节点类型 | POST | `/projects/:id/node-types` | Admin+ | M0 | 约定 |
| 节点类型 | PUT | `/node-types/:id` | Admin+ | M1 | 约定 |
| 迁移 | POST | `/schemas/:typeKey/migrations/preview` | Admin+ | M4 | 完整 |
| 迁移 | POST | `/schemas/:typeKey/migrations/execute` | Admin+ | M4 | 完整 |
| 迁移 | GET | `/schemas/migrations/:migrationId` | Admin+ | M4 | 完整 |
| 迁移 | POST | `/schemas/migrations/:migrationId/rollback` | Admin+ | M4 | 完整 |
| 协同 | WS | `/collab/:mapId` | Editor+(写)/Viewer+(读) | M0 | 完整 |
| 协同 | GET | `/maps/:mapId/snapshot` | Viewer+ | M1 | 完整 |
| 变更 | POST | `/maps/:mapId/changes`（内部） | Editor+ | M0 | 完整 |
| 变更 | GET | `/maps/:mapId/changes` | Viewer+ | M1 | 完整 |
| 变更 | GET | `/nodes/:nodeId/history` | Viewer+ | M1 | 约定 |
| AI | POST | `/ai/decompose` (SSE) | Editor+ | M2 | 完整 |
| AI | POST | `/ai/summarize` (SSE) | Viewer+ | M2 | 完整 |
| AI | POST | `/ai/proposals/:proposalId/apply` | Editor+ | M2 | 完整 |
| AI | POST | `/ai/complete` | Editor+ | M4 | 约定 |
| AI | POST | `/ai/converse` (SSE) | Editor+ | M4 | 约定 |
| AI | POST | `/ai/rewrite` (SSE) | Editor+ | M4 | 约定 |
| 里程碑 | GET | `/projects/:id/milestones` | Viewer+ | M2 | 约定 |
| 里程碑 | POST | `/projects/:id/milestones` | Editor+ | M2 | 完整 |
| 里程碑 | PATCH | `/milestones/:id` | Editor+ | M2 | 约定 |
| 里程碑 | DELETE | `/milestones/:id` | Editor+ | M2 | 约定 |
| 里程碑 | POST | `/projects/:id/milestones/ai-suggest` | Editor+ | M2 | 完整 |
| 人员替换 | POST | `/transfer/preview` | Admin+ | M3 | 完整 |
| 人员替换 | POST | `/transfer/execute` | Admin+ | M3 | 完整 |
| 人员替换 | GET | `/transfer/:jobId` | Admin+ | M3 | 完整 |
| IM | GET | `/projects/:id/im-channels` | Admin+ | M4 | 约定 |
| IM | POST | `/projects/:id/im-channels` | Admin+ | M4 | 完整 |
| IM | DELETE | `/im-channels/:id` | Admin+ | M4 | 约定 |
| IM | POST | `/im/publish` | Editor+ | M4 | 完整 |

---

## 3. 认证与用户

### POST /auth/login 【约定】 · M0
```jsonc
// 请求
{ "email": "a@b.com", "password": "..." }       // 或 { "phone","code" }
// 响应 200
{ "accessToken":"jwt...", "refreshToken":"...", "expiresIn":3600,
  "user": { "id":"u_1","displayName":"张三","avatarUrl":"..." } }
```

### POST /auth/refresh 【约定】 · M0
```jsonc
// 请求 { "refreshToken":"..." }
// 响应 200 { "accessToken":"jwt...","expiresIn":3600 }
```

### GET /me 【约定】 · M0
```jsonc
// 响应 200
{ "id":"u_1","tenantId":"tn_1","displayName":"张三","email":"a@b.com",
  "avatarUrl":"...","status":"active" }
```

---

## 4. 项目与成员

### GET /projects?parentId= 【约定】 · M0
列出当前用户可见项目；`parentId` 为空返回顶层，传值返回其子项目（父子项目）。
```jsonc
// 响应 200
{ "items":[ {"id":"p_1","name":"新产品立项","parentId":null,"mapId":"m_1","archived":false} ],
  "nextCursor":null }
```

### POST /projects 【约定】 · M0
```jsonc
// 请求 { "name":"新产品立项", "parentId":null, "inheritMembers":true }
// 响应 201 { "id":"p_1","name":"新产品立项","parentId":null,"mapId":"m_1" }
```

### GET /projects/:id 【约定】 · M0
```jsonc
// 响应 200
{ "id":"p_1","name":"...","parentId":null,"mapId":"m_1","archived":false,
  "myRole":"editor","memberCount":8 }
```

### PATCH /projects/:id 【约定】 · M0 — `{ "name?","archived?","inheritMembers?" }` → 200 项目对象
### DELETE /projects/:id 【约定】 · M0 — Owner 限定 → 204

### GET /projects/:id/permissions 【完整】 · M3
> 详见 权限与过滤详设 §11。当前用户在该项目的能力集，前端据此控制 UI 显隐。
```jsonc
// 响应 200
{ "role":"editor",
  "can": { "edit":true,"comment":true,"aiWrite":true,"manageMembers":false,
           "editSchema":false,"runMigration":false,"transfer":false,"publishIM":true } }
```

### GET /projects/:id/members 【约定】 · M0
```jsonc
// 响应 200
{ "items":[ {"userId":"u_1","displayName":"张三","role":"owner","inherited":false} ] }
```

### POST /projects/:id/members 【约定】 · M0
```jsonc
// 请求 { "userId":"u_2","role":"editor" }
// 响应 201 { "userId":"u_2","role":"editor" }
```

### PATCH /projects/:id/members/:userId 【完整】 · M3
> 详见 权限与过滤详设 §11。仅 Owner/Admin；新角色不可超该用户租户上限。
```jsonc
// 请求 { "role":"admin" }
// 响应 200 { "userId":"u_2","role":"admin" }
// 错误 403 FORBIDDEN（越权或超上限）
```

### DELETE /projects/:id/members/:userId 【约定】 · M3 — 移除成员 → 204（离职移交请用 §9 transfer）

---

## 5. 节点类型 Schema 与迁移

### GET /projects/:id/node-types 【约定】 · M0
```jsonc
// 响应 200
{ "items":[ { "id":"nt_1","typeKey":"task","version":4,"definition":{ /* 见主文档 3.3 */ } } ] }
```

### POST /projects/:id/node-types 【约定】 · M0
```jsonc
// 请求 { "typeKey":"task","definition":{ "displayName":"任务","fields":[] } }
// 响应 201 { "id":"nt_1","typeKey":"task","version":1 }
```

### PUT /node-types/:id 【约定】 · M1
更新定义并升 `version`。**若为破坏性变更（删/改字段）**，响应提示建议生成迁移。
```jsonc
// 请求 { "definition":{}, "version":5 }
// 响应 200 { "id":"nt_1","version":5,"breaking":true,"suggestMigration":true }
```

### 迁移端点 【完整】 · M4
> 详见 Schema迁移工具详设 §11、时序图 §10。算子首发 5 个：`renameField/setDefault/convertType/mapEnum/dropField`。回滚默认 7 天（租户可配 1–30 天）。

#### POST /schemas/:typeKey/migrations/preview （dryRun，不落库）
```jsonc
// 请求
{ "fromVersion":3,"toVersion":4,
  "filter":{"where":"data.legacy == true"},
  "ops":[ {"op":"renameField","from":"desc","to":"description"},
          {"op":"mapEnum","field":"status","mapping":{"doing":"in_progress"},"fallback":"todo"} ],
  "dryRun":true }
// 响应 200
{ "affected":126,
  "perOp":[ {"op":"renameField","ok":126,"fail":0},{"op":"mapEnum","ok":120,"fail":6} ],
  "samples":[ {"nodeId":"n_1","before":{"status":"doing"},"after":{"status":"in_progress"}} ],
  "issues":[ {"nodeId":"n_9","op":"mapEnum","reason":"值越界→fallback"} ] }
```

#### POST /schemas/:typeKey/migrations/execute
```jsonc
// 请求 (同 preview 去 dryRun) + 可选 scopeProjectIds
{ "fromVersion":3,"toVersion":4,"ops":[],"scopeProjectIds":["p_1","p_2"] }
// 响应 202 { "migrationId":"mig_x","status":"running" }
```

#### GET /schemas/migrations/:migrationId
```jsonc
// 响应 200
{ "migrationId":"mig_x","status":"running|done|failed|rolledback",
  "processed":120,"total":126,
  "result":{"ok":118,"skipped":6,"issues":2},
  "rollbackableUntil":1730600000000,
  "skippedProjects":[ {"projectId":"p_3","reason":"无Admin权限"} ] }
```

#### POST /schemas/migrations/:migrationId/rollback
```jsonc
// 响应 202 { "migrationId":"mig_x","status":"rolling_back","mode":"event_replay|snapshot" }
// 错误 409 CONFLICT（已回滚/超出回滚窗口）· 422 VALIDATION_ERROR（DSL）
```

---

## 6. 协同、快照与变更历史

### WS /collab/:mapId 【完整】 · M0
> 详见 Yjs协同详设 §13、时序图 §12。
- 握手：`wss://<host>/collab/:mapId?token=<JWT>`。
- `onAuthenticate` → 成员资格 + map 读/写权；无权关闭 `4401/4403/4404`。
- 帧：Yjs sync 协议 + Awareness（二进制，provider 封装）。Awareness 载荷见 Yjs协同详设 §6。

### GET /maps/:mapId/snapshot 【完整】 · M1
只读快照（导出/3D/搜索/AI 上下文用），非协同通道。
```jsonc
// 响应 200
{ "mapId":"m_1","version":128,
  "nodes":[ {"id":"n_1","parentId":null,"order":"a0","type":"objective","title":"...","ownerId":"u_1","data":{}} ],
  "generatedAt":1730000000000 }
```

### POST /maps/:mapId/changes （内部，命令层调用）【完整】 · M0
由**发起方**客户端/服务端编排批量落库语义变更事件（远端协同不重复派生，见 Yjs协同详设 §4.3）。
```jsonc
// 请求
{ "events":[ {"nodeId":"n_42","op":"setField","field":"priority","before":"中","after":"高","batchId":null,"ts":1730000000000} ] }
// 响应 200 { "accepted":1 }
```

### GET /maps/:mapId/changes （时间轴/历史查询）【完整】 · M1
查询参数：`actor, op, field, batchId, branch(子树根id), from, to, cursor, limit`。同 `batchId` 折叠由前端处理。
```jsonc
// 响应 200
{ "items":[ {"id":"c_1","nodeId":"n_42","actorId":"u_1","op":"setField","field":"priority","before":"中","after":"高","batchId":"b_1","ts":1730000000000} ],
  "nextCursor":null }
```

### GET /nodes/:nodeId/history 【约定】 · M1
单节点字段级历史（`GET /maps/.../changes?branch=` 的便捷封装）。
```jsonc
// 响应 200 { "nodeId":"n_42","items":[ {"op":"rename","before":"旧","after":"新","actorId":"u_1","ts":1730000000000} ] }
```

---

## 7. AI 能力

> 计费：平台默认额度 + 企业可自带 Key（主文档 A6）。超额 `429 QUOTA_EXCEEDED`。模型选择由网关按租户配置路由（AI拆解详设 §1/§8）。改变结构的能力（decompose/converse/complete）输出均为**提案**，须经预览确认。

### POST /ai/decompose (SSE) 【完整】 · M2
> 详见 AI拆解详设 §13、时序图 §12。
```jsonc
// 请求 (role ≥ Editor)
{ "mapId":"m_1","nodeId":"n_42","targetType":"task",
  "depth":1,"maxChildren":8,"prompt":"按后端任务拆，强调测试","lang":"zh" }
// 响应 text/event-stream
// event: meta  data: {"proposalId":"prop_x","batchId":"b_x","provider":"qwen","model":"qwen-max"}
// event: op    data: {"tempId":"t1","op":"addChild","parentRef":"n_42","node":{},"valid":true,"issues":[]}
// event: done  data: {"proposalId":"prop_x","stats":{"total":6,"valid":5,"invalid":1,"tokens":{"in":1200,"out":800}}}
// event: error data: {"code":"TIMEOUT","message":"...","retryable":true}
```
错误：400 校验 · 403 权限 · 404 节点 · 429 QUOTA_EXCEEDED · 502 UPSTREAM_ERROR · 504 TIMEOUT。

### POST /ai/summarize (SSE) 【完整】 · M2
```jsonc
// 请求 (scope 二选一)
{ "mapId":"m_1","scope":{"nodeId":"n_42"},"style":"bullet","lang":"zh" }
// { "mapId":"m_1","scope":{"range":{"from":1730000000000,"to":1730600000000}} }
// 响应: event:delta(逐token) → event:done {"summary":"...","tokens":{}}
```

### POST /ai/proposals/:proposalId/apply 【完整】 · M2
接受勾选 ops 落库（服务端编排/审计场景；前端亦可走命令层本地应用 + 异步落库）。
```jsonc
// 请求 { "acceptTempIds":["t1","t2"], "edits":{"t1":{"title":"接口设计(改)"}} }
// 响应 200 { "batchId":"b_x","createdNodeIds":["n_77","n_78"] }
```

### POST /ai/complete 【约定】 · M4
兄弟/子节点补全与查重建议（输出为提案）。
```jsonc
// 请求 { "mapId":"m_1","nodeId":"n_42","kinds":["missing","duplicate"] }
// 响应 200 { "proposalId":"prop_y","suggestions":[
//   {"kind":"missing","node":{}},
//   {"kind":"duplicate","nodeIds":["n_40","n_43"],"advice":"可合并"} ] }
```

### POST /ai/converse (SSE) 【约定】 · M4
对话式增量调整，输出统一提案（ops 含 add/update/merge/delete）。
```jsonc
// 请求 { "mapId":"m_1","anchorNodeId":"n_42","instruction":"把测试相关任务合并并补一个回归测试" }
// 响应: SSE，同 decompose 的 Proposal 流
```

### POST /ai/rewrite (SSE) 【约定】 · M4
```jsonc
// 请求 { "mapId":"m_1","nodeId":"n_42","field":"desc","style":"更简洁专业" }
// 响应: event:delta → event:done {"text":"..."}
```

---

## 8. 里程碑

### GET /projects/:id/milestones 【约定】 · M2
```jsonc
// 响应 200 { "items":[ {"id":"ms_1","title":"完成需求拆解","nodeId":"n_8","aiSummary":"...","rangeStart":1730000000000,"rangeEnd":1730600000000} ] }
```

### POST /projects/:id/milestones 【完整】 · M2
```jsonc
// 请求
{ "title":"完成需求拆解","description":"...","nodeId":"n_8",
  "range":{"start":1730000000000,"end":1730600000000} }
// 响应 201 { "id":"ms_1","title":"完成需求拆解","createdBy":"u_1" }
```

### PATCH /milestones/:id 【约定】 · M2 — `{ "title?","description?","aiSummary?","range?" }` → 200
### DELETE /milestones/:id 【约定】 · M2 → 204

### POST /projects/:id/milestones/ai-suggest 【完整】 · M2
AI 辅助：扫描近期变更建议里程碑 + 为区间生成阶段摘要初稿（人工为主，AI 辅助）。
```jsonc
// 请求 { "range":{"from":1730000000000,"to":1730600000000} }
// 响应 200
{ "suggestions":[ {"title":"完成支付模块拆解","reason":"该时段新增 18 个支付相关任务","anchorNodeId":"n_8"} ],
  "summaryDraft":"本阶段确定 3 大模块、12 个子目标……" }
```

---

## 9. 人员全局替换（离职移交）

> 详见 权限与过滤详设 §6/§11、时序图 §10。历史 `actor_id` 保真不变；执行幂等（仍==from 才改）；建议带 `Idempotency-Key`。

### POST /transfer/preview 【完整】 · M3
```jsonc
// 请求 { "fromUserId":"u_5","toUserId":"u_9","scope":"project|workspace|tenant","scopeId":"p_1" }
// 响应 200
{ "impact":{"projects":3,"nodes":126,"mentions":14,"memberships":3},
  "details":[ {"projectId":"p_1","nodes":80,"sampleNodeIds":["n_1","n_2"]} ] }
```

### POST /transfer/execute 【完整】 · M3
```jsonc
// 请求 { "fromUserId":"u_5","toUserId":"u_9","scope":"tenant","exclude":{"nodeIds":["n_9"]} }
// 响应 202 { "jobId":"job_x","status":"running" }
// 错误 409 CONFLICT（同范围已有进行中任务）
```

### GET /transfer/:jobId 【完整】 · M3
```jsonc
// 响应 200
{ "jobId":"job_x","status":"running|done|failed","processed":80,"total":126,
  "conflicts":[ {"nodeId":"n_30","reason":"当前值已非 from"} ] }
```

---

## 10. IM 渠道与发布

> 渠道适配：企业微信/钉钉/飞书/Slack/通用 Webhook。首版**手动发布**（订阅自动推送放后期，主文档 F12）。

### GET /projects/:id/im-channels 【约定】 · M4
```jsonc
// 响应 200 { "items":[ {"id":"ch_1","provider":"feishu","name":"产品群"} ] }   // 不回传密钥
```

### POST /projects/:id/im-channels 【完整】 · M4
```jsonc
// 请求 { "provider":"feishu","name":"产品群","config":{"webhook":"https://...","secret":"..."} }
// 响应 201 { "id":"ch_1","provider":"feishu","name":"产品群" }
// 错误 422 VALIDATION_ERROR（webhook 校验失败）· 502 UPSTREAM_ERROR（连通性测试失败）
```

### DELETE /im-channels/:id 【约定】 · M4 → 204

### POST /im/publish 【完整】 · M4
手动把节点/里程碑/摘要发布为消息卡片。
```jsonc
// 请求
{ "channelId":"ch_1","payloadType":"node|milestone|summary","refId":"n_42",
  "note":"请相关同学关注" }                 // refId: node→nodeId, milestone→ms_id, summary→mapId
// 响应 200 { "delivered":true,"messageId":"im_msg_123" }
// 错误 502 UPSTREAM_ERROR（IM 拒收）
```
消息卡片模板见主文档附录 D。

---

## 11. 共享数据对象（Schema 速查）

> 各端点引用的核心对象统一定义，避免散落。

### Node（快照形态）
```jsonc
{ "id":"n_1","parentId":"n_0|null","order":"a0V","type":"task",
  "title":"完成支付模块","ownerId":"u_1|null","status":"doing","tags":["支付"],
  "collaborators":["u_2"],"data":{ "priority":"高","due":1730600000000 },
  "links":[ {"kind":"reference|subproject","targetId":"n_99|p_2"} ],"private":false }
```
> 协同态下 `title` 与 richtext 字段为 `Y.Text`，结构见 Yjs协同详设 §2；此处为 REST 快照的扁平 JSON。

### NodeTypeSchema.definition
```jsonc
{ "typeKey":"task","displayName":"任务","icon":"✅","color":"#3B82F6",
  "fields":[ {"key":"priority","label":"优先级","type":"enum","options":["高","中","低"],"default":"中"} ],
  "aiHints":"可执行任务节点……" }
```
字段类型枚举见主文档 §3.3。

### ChangeEvent
```jsonc
{ "id":"c_1","mapId":"m_1","nodeId":"n_42","actorId":"u_1",
  "op":"create|delete|move|rename|setField|setOwner|transfer|aiGenerate|comment",
  "field":"priority|null","before":null,"after":null,"batchId":"b_1|null","ts":1730000000000 }
```

### Proposal（AI 提案，预览用，非持久）
```jsonc
{ "proposalId":"prop_x","capability":"decompose","mapId":"m_1","anchorNodeId":"n_42","batchId":"b_x",
  "ops":[ {"tempId":"t1","op":"addChild","parentRef":"n_42","node":{},"valid":true,"issues":[]} ],
  "modelMeta":{"provider":"qwen","model":"qwen-max","tokens":{"in":1200,"out":800}} }
```

---

## 12. 变更影响 / 待评审项

以下接口细节会随实现微调，联调前需对齐：

- **【约定】端点的字段**可能微调（命名/可选性），以本表与各详设为准，实现时若有出入须回写本文。
- `branch` 过滤（按子树根 id）依赖服务端能否高效按祖先查询 change_events，可能需在事件落库时冗余 `pathIds`。
- SSE 在私有部署网关/反代下的缓冲问题需联调验证（禁用代理缓冲、`X-Accel-Buffering: no`）。
- `Idempotency-Key` 的服务端留存窗口（建议 24h）待定。
- AI `proposals/:id/apply` 与「前端命令层本地应用」二选一/并存策略：首版以**前端本地应用 + 异步落库**为主，该 REST 端点用于审计/服务端编排，需在实现时确认是否首版即提供。

---

*（契约总览结束。任何端点变更请同步更新本文件与对应详设，保持单一事实来源。）*
