#!/bin/bash
# LLM Aggregator — VPS Deployment
# Prerequisites: Docker on VPS (apt install docker.io docker-compose-v2)
#
# Usage:
#   1. Copy this project to your VPS (scp -r llm-aggregator user@host:~/)
#   2. Copy .env.production.example to .env.production and fill in values
#   3. Run: ./deploy.sh

set -e

echo "=== 1. Build Docker image ==="
docker build -t llm-aggregator:latest .

echo "=== 2. Start services ==="
docker compose -f docker-compose.prod.yml up -d

echo "=== 3. Wait for DB to be ready ==="
sleep 5

echo "=== 4. Run database migration ==="
docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy

echo "=== 5. Seed default models & route rules ==="
docker compose -f docker-compose.prod.yml exec -T app node prisma/seed.js 2>/dev/null || echo "(seed skipped - data may already exist)"

echo ""
echo "=== Deployment complete! ==="
echo "App running on http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "Next steps:"
echo "  1. Set up Nginx (sudo cp nginx.conf /etc/nginx/sites-available/llm-aggregator)"
echo "  2. sudo ln -s /etc/nginx/sites-available/llm-aggregator /etc/nginx/sites-enabled/"
echo "  3. Replace 'your-domain.com' with your actual domain"
echo "  4. sudo nginx -t && sudo systemctl reload nginx"
echo "  5. Set up SSL: sudo certbot --nginx -d your-domain.com"
