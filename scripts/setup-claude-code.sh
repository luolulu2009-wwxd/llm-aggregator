#!/bin/bash
# 聚合站 Claude Code 一键配置
# 用法: bash scripts/setup-claude-code.sh <你的API_Key>
#
# 示例: bash scripts/setup-claude-code.sh sk-cc04df7bc5fd0bc1270788ff889940e7

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$1" ]; then
  echo -e "${RED}❌ 请提供你的 API Key${NC}"
  echo "   用法: bash scripts/setup-claude-code.sh <你的API_Key>"
  echo ""
  echo "   💡 在 https://llm.saylulu.com/dashboard/keys 查看或生成"
  exit 1
fi

API_KEY="$1"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo -e "${YELLOW}🔧 配置聚合站...${NC}"

# Check if settings.json exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Check if jq is available, otherwise fall back to node
if command -v jq &> /dev/null; then
  # Use jq for safe JSON manipulation
  jq --arg token "$API_KEY" \
     --arg url "https://llm.saylulu.com/v1/messages" \
    '.env.ANTHROPIC_AUTH_TOKEN = $token |
     .env.ANTHROPIC_BASE_URL = $url |
     .env.ANTHROPIC_MODEL = "claude-sonnet-5" |
     .env.ANTHROPIC_DEFAULT_SONNET_MODEL = "claude-sonnet-5" |
     .env.ANTHROPIC_DEFAULT_OPUS_MODEL = "claude-opus-4-8" |
     .env.ANTHROPIC_DEFAULT_HAIKU_MODEL = "claude-haiku-4-5"' \
    "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
else
  # Fallback: Node.js inline JSON manipulation
  node -e "
const fs = require('fs');
const apiKey = '$API_KEY';
const file = '$SETTINGS_FILE';
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.env = config.env || {};
config.env.ANTHROPIC_AUTH_TOKEN = apiKey;
config.env.ANTHROPIC_BASE_URL = 'https://llm.saylulu.com/v1/messages';
config.env.ANTHROPIC_MODEL = 'claude-sonnet-5';
config.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'claude-sonnet-5';
config.env.ANTHROPIC_DEFAULT_OPUS_MODEL = 'claude-opus-4-8';
config.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = 'claude-haiku-4-5';
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log('OK');
"
fi

echo ""
echo -e "${GREEN}✅ 配置完成！${NC}"
echo ""
echo "   🔑 API Key:     ${API_KEY:0:10}..."
echo "   🌐 聚合站地址:   https://llm.saylulu.com"
echo "   🧠 默认模型:     claude-sonnet-5"
echo ""
echo -e "${YELLOW}📝 接下来：${NC}"
echo "   1. 重启 Claude Code（或打开新终端窗口）"
echo "   2. 聚合站通过智能路由自动选择最优模型"
echo ""
echo -e "${YELLOW}💰 赚 Credits：${NC}"
echo "   https://llm.saylulu.com/dashboard → 贡献你的 API Key"
echo "   每次你的 Key 被使用，自动赚 ×1.1~1.2 倍 provider 成本"
