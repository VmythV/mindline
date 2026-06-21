# @mindline/cli

思谱 Mindline 命令行客户端。定位：**安装后配置为 AI 的 SKILL，让 AI 通过它操作整个思谱软件**（也可用于脚本自动化）。薄封装 `apps/api` 的 REST + SSE，不另起业务逻辑。

## 安装与构建

```bash
# 仓库内开发
pnpm --filter @mindline/cli build
node apps/cli/dist/index.js --help

# 或链接为全局命令（产物自带 shebang + bin: mindline）
pnpm --filter @mindline/cli build
npm i -g ./apps/cli        # 或发布后 npm i -g @mindline/cli
mindline --help
```

## 配置

- 服务地址：默认 `http://localhost:3001/api`；用 `--api <url>` 或环境变量 `MINDLINE_API_BASE` 覆盖。
- 凭证：`mindline login` 后存于 `~/.mindline/config.json`（权限 0600），含 access/refresh token，过期自动刷新。
- 临时鉴权：`--token <accessToken>` 直接传 token（不读/写本地登录态）。

## 用法

见 [SKILL.md](./SKILL.md) 的命令速查。所有命令支持 `--json` 输出结构化结果。

## 设计要点

- **对 agent 友好**：`--json` 统一输出 `{ok,data}` / `{ok,error}`，错误码与 `@mindline/shared` 对齐。
- **薄封装**：仅转发 `/api` 接口；鉴权、刷新、SSE 解析在 CLI 侧完成。
- **路线 1 范围**：只读查询 + 非协同 REST 写（项目/IM）+ AI 结果展示。节点结构性写入（经 Y.Doc 协同）待路线 2 打通服务端写通道后再加。

## 目录

```
src/
  index.ts            commander 装配 + 全局选项（--json/--api/--token）
  config.ts           ~/.mindline/config.json 凭证存取
  client.ts           带鉴权请求 + 401 自动刷新 + SSE 解析
  output.ts           人类可读 / JSON 双模输出
  commands/           auth · project · node · ai · timeline · im
SKILL.md              可挂载的 AI skill 描述
```
