#!/bin/bash
# Claude Code Aggregator Fallback
# 先试聚合站 → 5秒超时则降级到官方 API → 完全不崩
#
# 用法:
#   1. chmod +x scripts/claude-code-fallback.sh
#   2. Claude Code VSCode settings.json:
#      { "apiKeyHelper": "/path/to/llm-aggregator/scripts/claude-code-fallback.sh" }

AGGREGATOR="https://llm.saylulu.com/api"
OFFICIAL="https://api.anthropic.com"

# 快速健康检查 (2s 超时)
if curl -s -m 2 -o /dev/null -w '%{http_code}' "$AGGREGATOR/v1/models" 2>/dev/null | grep -q '200'; then
    echo "$AGGREGATOR"
else
    echo "[fallback] aggregator unreachable, using official API" >&2
    echo "$OFFICIAL"
fi
