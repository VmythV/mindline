#!/usr/bin/env bash
# 启动本地中间件：Postgres / Redis / MinIO
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ 启动中间件 (Postgres / Redis / MinIO)…"
docker compose up -d postgres redis minio

echo "▶ 等待关键服务健康（Postgres / Redis）…"
docker compose up -d --wait postgres redis 2>/dev/null || true

echo
docker compose ps
echo
echo "✔ 中间件已启动："
echo "  Postgres → localhost:5432 (mindline/mindline)"
echo "  Redis    → localhost:6379"
echo "  MinIO    → http://localhost:9000  控制台 http://localhost:9001"
