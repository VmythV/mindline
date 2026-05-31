#!/usr/bin/env bash
# 启动应用服务：api(3001) / collab(3002) / web(5173)
#   用法：
#     scripts/services-start.sh        # 前台启动（开发模式，热更新，Ctrl+C 停止）
#     scripts/services-start.sh fg     # 同上
#     scripts/services-start.sh bg     # 后台启动（构建产物运行），日志写入 logs/
#   日志：
#     前台 → logs/services.log（同时输出到终端）
#     后台 → logs/api.log / logs/collab.log / logs/web.log（PID 记于 logs/*.pid）
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p logs
# 载入 .env（若存在）
if [ -f .env ]; then set -a; . ./.env; set +a; fi

MODE="${1:-fg}"

echo "▶ 构建共享包 @mindline/shared, @mindline/db…"
pnpm exec turbo run build --filter=@mindline/shared --filter=@mindline/db >/dev/null

case "$MODE" in
  fg | --fg)
    echo "▶ 前台启动 api + collab + web（开发模式 / 热更新；Ctrl+C 停止）"
    echo "  日志 → logs/services.log"
    echo "  api http://localhost:3001/api · collab ws://localhost:3002 · web http://localhost:5173"
    echo
    pnpm exec turbo run dev --ui=stream 2>&1 | tee logs/services.log
    ;;

  bg | --bg)
    echo "▶ 构建全部服务（api / collab / web）…"
    pnpm exec turbo run build >/dev/null

    echo "▶ 后台启动，日志写入 logs/"
    nohup node apps/api/dist/main.js >logs/api.log 2>&1 &
    echo $! >logs/api.pid
    nohup node apps/collab/dist/index.js >logs/collab.log 2>&1 &
    echo $! >logs/collab.pid
    nohup pnpm -C apps/web preview --port 5173 >logs/web.log 2>&1 &
    echo $! >logs/web.pid

    sleep 1
    echo
    echo "✔ 已后台启动："
    echo "  api    → http://localhost:3001/api  (PID $(cat logs/api.pid), logs/api.log)"
    echo "  collab → ws://localhost:3002        (PID $(cat logs/collab.pid), logs/collab.log)"
    echo "  web    → http://localhost:5173      (PID $(cat logs/web.pid), logs/web.log)"
    echo "  停止： scripts/services-stop.sh"
    ;;

  *)
    echo "用法: $0 [fg|bg]"
    exit 1
    ;;
esac
