# Yjs 实时协同 · 详细设计

> 配套主文档 `../思谱-需求文档.md` 第 5.3、5.4 节。本篇细化协同文档结构、排序、命令层、变更事件派生、撤销重做、在线状态与服务端持久化。

| 项   | 内容                                    |
| ---- | --------------------------------------- |
| 版本 | v0.1                                    |
| 日期 | 2026-05-30                              |
| 关联 | F1 编辑、F8 协作、F4 变更记录、D1/D2/D7 |
| 排期 | 协同内核与命令层 M0；Awareness/历史 M1  |

---

## 1. 文档边界

- **一个 MindMap = 一个 Y.Doc**，按 `mapId` 命名空间。
- 业务实体（用户、项目、成员、Schema、里程碑、IM）走关系库与 REST，不进 Y.Doc。
- `change_events` 由命令层派生后经 API/服务端落库，**不**存在 Y.Doc 内（历史不可被协同篡改）。

---

## 2. Y.Doc 结构

```
Y.Doc
 ├── meta: Y.Map
 │     ├── version: number          // 文档结构版本
 │     ├── rootId: string           // 根节点 id
 │     └── schemaVersionByType: Y.Map<typeKey, number>
 │
 └── nodes: Y.Map<nodeId, Y.Map>    // 扁平节点索引（非嵌套，便于随机访问与移动）
       └── 每个 node Y.Map:
             ├── id:            string
             ├── parentId:      string | null   // null = 根
             ├── order:         string          // 分数索引（见第3节）
             ├── type:          string          // typeKey
             ├── title:         Y.Text          // 协同标题（轻富文本）
             ├── ownerId:       string | null
             ├── status:        string
             ├── tags:          Y.Array<string>
             ├── collaborators: Y.Array<string>
             ├── data:          Y.Map           // 结构字段
             │     └── <richtext字段key>: Y.Text   // collab:true 字段
             ├── links:         Y.Array<Link>
             └── private:       boolean         // 软权限标记
```

**为什么扁平存储**：树用 `parentId + order` 表达而非物理嵌套。移动节点 = 改 `parentId` + `order` 两个字段，避免在嵌套结构里搬移子树（CRDT 下嵌套搬移易冲突且代价大）。子树查询在内存按 `parentId` 建索引。

**children 派生**：前端维护 `parentId → 有序子节点` 的派生索引（监听 nodes 变化增量更新），不在文档里存 children 数组（否则与 parentId 双写易不一致）。

---

## 3. 排序：分数索引（Fractional Indexing）

- `order` 为字符串型分数索引（如 `"a0"`, `"a0V"`, `"a1"`）。
- 在 A、B 之间插入 → 生成介于二者之间的新键，**无需重排同级其他节点**，并发插入也少冲突。
- 库：`fractional-indexing`。
- 极端并发同位插入可能产生相同键 → 以 `nodeId` 做稳定次序兜底（二级排序）。
- 周期性「整理」任务可重新均匀化键（可选，非必需）。

---

## 4. 命令层（Command Layer）

**所有用户编辑必须经命令层**，这是唯一写入口。命令同时：① 在一个 Yjs 事务内改文档（带 origin 标记），② 产出语义 `ChangeEvent`。

> **命令层下沉（路线2）**：命令层实现已从 `apps/web` 下沉到 `packages/map-core`（`MapRepository`），前后端复用——浏览器直接执行；服务端（api 的 `CollabWriterService`，经 `POST /maps/:mapId/commands`）作为 Hocuspocus 客户端连入 collab 后执行同一套命令，供 CLI / AI 写节点。**无论谁触发，写入口仍只此一处**（约定②不变）。

### 4.1 命令清单

| 命令          | 文档变更                            | 产出 ChangeEvent.op              |
| ------------- | ----------------------------------- | -------------------------------- |
| CreateNode    | 在 nodes 加节点 + 设 parentId/order | create                           |
| DeleteSubtree | 递归删节点（或标记 tombstone）      | delete（每节点一条，同 batchId） |
| MoveNode      | 改 parentId/order                   | move（before/after = 父+序）     |
| RenameNode    | 改 title                            | rename                           |
| SetField      | 改 data.<key>                       | setField（field/before/after）   |
| SetOwner      | 改 ownerId                          | setOwner                         |
| SetType       | 改 type（按 A10 处理 data）         | setField（type）                 |
| Transfer      | 批量改 owner/collab/@               | transfer（批量，同 batchId）     |
| ApplyProposal | 接受 AI proposal 的勾选 ops         | aiGenerate（同 batchId）         |
| AddComment    | （评论存关系库，非 Y.Doc）          | comment                          |

### 4.2 命令执行骨架

```ts
function execute(cmd: Command, ctx: Ctx) {
  const events: ChangeEvent[] = [];
  ydoc.transact(() => {
    cmd.apply(ydoc, (ev) => events.push(ev)); // apply 内部收集语义事件
  }, ctx.origin /* 本地客户端标识，供 UndoManager/派生用 */);
  changeEventSink.emit(events); // 异步批量送 API 落库
}
```

- **事务原子性**：一条命令的所有文档改动在单个 `transact` 内，要么全应用要么不（本地）。
- **批次**：批量命令（删子树/transfer/applyProposal）共享 `batchId`，时间轴折叠。

### 4.3 ChangeEvent 派生方式

采用「**命令显式产出**」而非「监听 observeDeep 反推」：

- 命令最清楚自己改了什么（field、before、after），直接构造事件，可靠且可读。
- observeDeep 反推语义（区分「移动」vs「删+建」）困难且易错。
- 远端协同进来的变更**不**在本地重复派生事件（避免重复落库）——事件由**发起方**客户端产出并落库；其他端只应用文档变更。

> 一致性兜底：服务端 `onStoreDocument` 可对快照做周期校验，发现事件流与文档状态漂移时告警（非阻塞）。

---

## 5. 撤销重做（UndoManager，A9）

```ts
const undoManager = new Y.UndoManager(nodesType, {
  trackedOrigins: new Set([localOrigin]), // 仅跟踪本地 origin → 只撤自己
  captureTimeout: 500, // 500ms 内的连续输入合并为一步
});
```

- **仅撤销自己的操作**（trackedOrigins 限定本地 origin），多人协作不误撤他人。
- 撤销/重做本身也经命令层产出补偿 ChangeEvent（op 记为对应反操作），保证时间轴完整。
- 富文本（Y.Text）的撤销由同一 UndoManager 统一管理，避免「文本撤销」与「结构撤销」割裂。
- `captureTimeout` 让连续打字合并为一次撤销单元。

---

## 6. 在线状态（Awareness）

- 通过 Hocuspocus 的 Awareness 协议广播**临时状态**（不进文档、不持久化）：
  ```jsonc
  { "user": { "id", "name", "avatar", "color" },
    "cursor": { "nodeId", "field", "selection": [anchor, head] },
    "editingNodeId": "n_42" }
  ```
- 渲染：他人光标/选区彩色显示；节点显示「张三正在编辑」徽标；在线头像列表。
- 断线：Awareness 自动过期清除（心跳超时）。

---

## 7. 服务端（Hocuspocus）

```
WS /collab/:mapId
  │
  ├─ onAuthenticate(token)        // 校验 JWT → 解析 user/tenant
  │     → 校验项目成员资格 + 该 map 读/写权限
  │     → 注入 context（userId, role）；无权拒绝连接
  │
  ├─ onLoadDocument()             // 从 Postgres 取最新快照 + 增量 update 重建 Y.Doc
  │
  ├─ onChange()                   // 文档变更（可选：轻量审计/触发订阅）
  │
  ├─ onStoreDocument()            // 防抖后把 Y.Doc 编码为 update 落库；周期生成快照
  │
  └─ extension: Redis             // 多实例间广播 update + awareness（水平扩展）
```

### 7.1 持久化模型

| 表                                                | 内容                     |
| ------------------------------------------------- | ------------------------ |
| `yjs_updates(map_id, seq, update bytea, ts)`      | 增量 update 追加写       |
| `yjs_snapshots(map_id, version, state bytea, ts)` | 周期全量快照（压实历史） |

- 加载：取最近快照 + 其后的增量 updates 合并重建。
- 压实：增量积累到阈值 → 生成新快照 → 旧 updates 可归档/清理。
- 与 `change_events`（语义历史）分离：updates 是 CRDT 底层，change_events 是人类可读历史，二者用途不同。

### 7.2 鉴权与权限（首版软隔离）

- 连接级：成员资格 + map 读写权限（决定能否连、能否写）。
- 节点级软权限（private）：**首版在前端过滤**，服务端仍下发全文（软隔离，见权限详设）。
- 硬隔离（M6）：拆内容子文档后，服务端按权限决定下发哪些子文档（见权限详设 §5）。

---

## 8. 性能与扩展

- 大文档：节点扁平 Map + 派生索引；渲染层视口虚拟化（仅渲染可视节点）。
- 超大图（上万节点）：M5/M6 引入「子树懒加载」「内容延迟同步」（骨架先到，正文按需）。
- 多实例：Redis 广播；无状态协同节点，按 mapId 一致性哈希路由（同一文档尽量落同实例减跨节点广播）。

---

## 9. 验收标准

- 两端在线编辑互见延迟 < 500ms；断网 10s 重连自动合并无丢失。
- 撤销仅影响本人操作，不回退他人改动。
- 任一字段修改都能在 `change_events` 查到 actor/ts/before/after。
- 一次删除 N 节点子树 / 一次 AI 拆解，时间轴各折叠为 1 条批量事件。
- 服务端重启后从快照+增量正确重建文档。

---

## 10. 待定/风险

- 命令层「显式产出事件」要求所有写入都走命令层——需在架构上**禁止**绕过命令直接改 Y.Doc（代码评审/封装强约束）。
- 分数索引并发同位插入的稳定性 → nodeId 兜底次序 + 可选整理任务。
- 富文本与结构撤销统一管理的边界情况需测试覆盖。

---

## 11. 待定点敲定（原 §10）

| 原待定               | 敲定结论                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 禁止绕过命令层       | Y.Doc 写操作全部封装在 `MapRepository`，对外仅暴露命令 API；ESLint 自定义规则禁止业务层直接 import yjs 写类型；CI 静态检查拦截绕过。            |
| 分数索引并发同位插入 | 键相同时以 `nodeId` 字典序作二级稳定排序兜底；不做实时整理；提供阈值触发的后台 `reindex` 维护任务（可选）。                                     |
| 富文本+结构撤销边界  | 单一 `UndoManager` 同时 track `nodes`（含内嵌 Y.Text）；`captureTimeout=500ms`；跨多节点的复合命令用 `stopCapturing()` 显式封为一个 undo 单元。 |

## 12. 时序图：连接 → 加载 → 协同编辑 → 落库

```mermaid
sequenceDiagram
  autonumber
  participant FE as 前端
  participant HP as Hocuspocus
  participant PG as Postgres
  participant RD as Redis
  participant API as 应用API
  FE->>HP: WS connect /collab/:mapId (token)
  HP->>HP: onAuthenticate 校验JWT+成员+读写权
  HP->>PG: onLoadDocument 取最新快照+增量updates
  PG-->>HP: snapshot + updates
  HP->>HP: 合并重建 Y.Doc
  HP-->>FE: 初始同步(sync step1/2)
  Note over FE: 用户编辑 → 命令层 transact(本地, origin)
  FE->>HP: 发送 update
  HP->>RD: 广播 update / awareness(多实例)
  HP-->>FE: 转发给其他在线客户端
  FE->>API: 发起方落库 ChangeEvent(批量,异步)
  HP->>PG: onStoreDocument 防抖落 update;周期快照压实
```

## 13. 接口契约

### WS /collab/:mapId (Hocuspocus)

握手：`?token=<JWT>`（或子协议头）。服务端 `onAuthenticate` 解析 → 注入 `{userId, tenantId, role}`；无权 → 关闭码 4401。
消息：Yjs sync 协议 + Awareness（二进制帧，由 provider 封装）。
关闭码：4401 未授权 · 4403 无该 map 权限 · 4404 map 不存在 · 1011 服务端错误。

### GET /api/maps/:mapId/snapshot

只读快照（导出/3D/搜索/AI 上下文用），非协同通道。

```jsonc
// 响应 200
{
  "mapId": "m_1",
  "version": 128,
  "nodes": [
    {
      "id": "n_1",
      "parentId": null,
      "order": "a0",
      "type": "objective",
      "title": "...",
      "ownerId": "u_1",
      "data": {},
    },
  ],
  "generatedAt": 1730000000000,
}
```

### POST /api/maps/:mapId/changes (内部, 命令层调用)

批量落库语义变更事件（由发起方写入）。

```jsonc
// 请求
{
  "events": [
    {
      "nodeId": "n_42",
      "op": "setField",
      "field": "priority",
      "before": "中",
      "after": "高",
      "batchId": null,
      "ts": 1730000000000,
    },
  ],
}
// 响应 200 { "accepted": 1 }
```

### GET /api/maps/:mapId/changes (时间轴/历史查询)

查询参数：`actor, op, field, batchId, branch(子树根id), from, to, cursor, limit`。

```jsonc
// 响应 200
{
  "items": [
    {
      "id": "c_1",
      "nodeId": "n_42",
      "actorId": "u_1",
      "op": "setField",
      "field": "priority",
      "before": "中",
      "after": "高",
      "batchId": "b_1",
      "ts": 1730000000000,
    },
  ],
  "nextCursor": "...",
}
```
