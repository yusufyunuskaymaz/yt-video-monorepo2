#!/bin/bash
# ========================================
# RunPod'da Python Video API Başlatma Scripti
# ========================================
# Bu script RunPod pod'unda çalıştırılacak
# Docker Compose KULLANMIYOR - direkt docker run

# Ortam değişkenlerini ayarla (pod'da .env dosyası oluştur veya buraya yaz)
export R2_ACCOUNT_ID="your_account_id"
export R2_ENDPOINT="https://your_account_id.r2.cloudflarestorage.com"
export R2_ACCESS_KEY_ID="your_access_key_id"
export R2_SECRET_ACCESS_KEY="your_secret_access_key"
export R2_BUCKET_NAME="ai-voice"
export R2_PUBLIC_URL="https://voicy.site"
export FAL_KEY="your_fal_key"
# Hetzner'daki Node.js backend'in public URL'i
export NODE_CALLBACK_URL="http://YOUR_HETZNER_IP:3000/webhook"

echo "🚀 Python Video API başlatılıyor..."
echo "📡 Callback URL: $NODE_CALLBACK_URL"

# Docker Hub'dan image'ı çek ve çalıştır
docker run -d \
  --name video-api \
  --gpus all \
  -p 8000:8000 \
  -e PYTHON_API_PORT=8000 \
  -e R2_ACCOUNT_ID="$R2_ACCOUNT_ID" \
  -e R2_ENDPOINT="$R2_ENDPOINT" \
  -e R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e R2_BUCKET_NAME="$R2_BUCKET_NAME" \
  -e R2_PUBLIC_URL="$R2_PUBLIC_URL" \
  -e FAL_KEY="$FAL_KEY" \
  -e NODE_CALLBACK_URL="$NODE_CALLBACK_URL" \
  -e IMAGEMAGICK_BINARY=/usr/bin/convert \
  kaymazyusuf/video-api-v2:latest

echo "✅ Container başlatıldı!"
echo ""
echo "📋 Logları görmek için:"
echo "   docker logs -f video-api"
echo ""
echo "🔗 API Test:"
echo "   curl http://localhost:8000/health"
echo ""
echo "🛑 Durdurmak için:"
echo "   docker stop video-api && docker rm video-api"
