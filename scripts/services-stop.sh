#!/usr/bin/env bash
# 停止应用服务（api/collab/web）。按端口结束监听进程 + PID 文件兜底。
set -uo pipefail
cd "$(dirname "$0")/.."

echo "▶ 停止应用服务…"

stop_svc() {
  local name="$1" port="$2"
  local pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  停止 $name (端口 $port, PID: $(echo "$pids" | tr '\n' ' '))"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  else
    echo "  $name (端口 $port) 未在运行"
  fi
  if [ -f "logs/$name.pid" ]; then
    kill "$(cat "logs/$name.pid")" 2>/dev/null || true
    rm -f "logs/$name.pid"
  fi
}

stop_svc api 3001
stop_svc collab 3002
stop_svc web 5173

echo "✔ 已停止"
