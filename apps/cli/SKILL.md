---
name: mindline
description: 通过 mindline CLI 操作思谱思维导图——查项目/节点树/时间轴、跑 AI 拆解与摘要、发布 IM。当用户要求查看或操作思谱（Mindline）思维导图、项目、节点、变更时间轴时使用。
---

# Mindline CLI Skill

用命令行客户端 `mindline` 操作思谱 Mindline。**所有命令加 `--json` 以获得结构化输出便于解析。**

## 前置

1. 已安装 CLI：`npm i -g @mindline/cli`（或在仓库内 `pnpm --filter @mindline/cli build` 后 `node apps/cli/dist/index.js`）。
2. 已登录：`mindline login --email <邮箱> --password <密码>`（凭证存 `~/.mindline/config.json`，后续命令自动鉴权、过期自动刷新）。
3. 如需指向非默认服务：加 `--api http://host:3001/api`，或设环境变量 `MINDLINE_API_BASE`。

## 输出协议

- 加 `--json`：成功输出 `{"ok":true,"data":...}`，失败输出 `{"ok":false,"error":{"code","message"}}`，退出码非零。
- 不加 `--json`：人类可读文本。

## 命令速查

```bash
# 认证
mindline login --email <e> --password <p>     # 登录
mindline whoami --json                          # 当前用户
mindline logout

# 项目（含父子项目）
mindline project list --json                     # 列出项目（含 mapId）
mindline project list --parent <projectId> --json
mindline project get <projectId> --json
mindline project create "<名称>" [--parent <projectId>] --json

# 节点 · 只读（来自地图快照）
mindline node tree <mapId> --json                # 整张图树形
mindline node get <mapId> <nodeId> --json        # 单节点详情（含自定义字段）

# 节点 · 协同写入（经服务端写通道，需 Editor+，实时广播给所有在线客户端）
mindline node create <mapId> <parentId> [--title "<标题>"] [--type <typeKey>] --json
mindline node rename <mapId> <nodeId> "<新标题>" --json
mindline node move <mapId> <nodeId> <newParentId> --json
mindline node delete <mapId> <nodeId> --json     # 删除节点及整棵子树
mindline node set-field <mapId> <nodeId> <field> '<jsonValue>' --json

# AI（SSE）
mindline ai decompose <mapId> <nodeId> [--type <typeKey>] [--max <n>] [--prompt "<指令>"] [--apply] --json
mindline ai summarize <mapId> <nodeId> [--scope subtree|node] [--prompt "<指令>"] --json

# 时间轴 / 历史
mindline timeline <mapId> [--limit <n>] [--node <id>] [--actor <id>] [--op <op>] [--branch <id>] --json
mindline history <nodeId> [--limit <n>] --json

# IM 发布
mindline im channels <projectId> --json
mindline im publish <channelId> <node|milestone|summary> <targetId> [--content "<文本>"] --json
```

## 典型流程

1. `mindline project list --json` → 拿到目标项目的 `mapId`。
2. `mindline node tree <mapId> --json` → 了解结构，定位目标 `nodeId`。
3. `mindline ai decompose <mapId> <nodeId> --json` → 得到拆解提案（`data.ops`）。
4. `mindline timeline <mapId> --limit 20 --json` → 查看近期变更。

## 写入说明

- 节点的结构性写入（create/rename/move/delete/set-field）经 api 写通道作用于协同文档（Y.Doc），**实时广播给所有在线客户端**；需 Editor+ 角色。
- `node tree` / `node get` 读的是落库快照，**可能滞后实时编辑/刚写入数秒**；`timeline` 读 DB 为即时。写入后若立即 `node tree` 没看到，稍等重试。
- `ai decompose --apply` 仅写回**有效**提案（产出 `aiGenerate` 批量事件）。
