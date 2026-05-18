#!/bin/bash
# New-API 配置更新脚本
# 执行方式: sudo bash /home/lisa/matrix/update-config.sh

set -e

echo "=========================================="
echo "1. 复制 Nginx 配置..."
cp /home/lisa/matrix/nginx-matrix-3000.conf /etc/nginx/sites-available/matrix-3000
echo "✅ Nginx 配置已复制"

echo "=========================================="
echo "2. 测试 Nginx 配置..."
nginx -t
echo "✅ Nginx 配置测试通过"

echo "=========================================="
echo "3. 重载 Nginx..."
systemctl reload nginx
echo "✅ Nginx 已重载"

echo "=========================================="
echo "4. 重建 Docker 容器..."
cd /home/lisa/matrix/new-api
docker compose down
docker compose up -d
echo "✅ Docker 容器已重建"

echo "=========================================="
echo "5. 等待服务启动..."
sleep 5

echo "=========================================="
echo "6. 检查服务状态..."
docker compose ps

echo "=========================================="
echo "✅ 配置更新完成！"
echo ""
echo "访问: https://matrix.000328.xyz:2053/"
echo ""
echo "查看日志: cd /home/lisa/matrix/new-api && docker compose logs -f new-api"