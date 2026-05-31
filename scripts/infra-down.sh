#!/usr/bin/env bash
# 停止本地中间件。默认保留数据卷；传 --clean 连同数据卷一起删除。
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--clean" ]; then
  echo "▶ 停止中间件并删除数据卷（--clean，数据会丢失）…"
  docker compose down -v
  echo "✔ 已停止并清除数据卷"
else
  echo "▶ 停止中间件（保留数据卷；如需删卷请加 --clean）…"
  docker compose stop postgres redis minio
  echo "✔ 已停止（数据卷保留）"
fi
