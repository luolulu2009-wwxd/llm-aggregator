#!/bin/bash
# 独立测试聚合站 — 不影响主 Claude Code 工作流
# 用法: bash scripts/test-claude-code.sh

export ANTHROPIC_BASE_URL="https://llm.saylulu.com/api"
export ANTHROPIC_AUTH_TOKEN="sk-afdd913b6848fe136090ee3b1528d2d326dd2801676b884b"
export ANTHROPIC_MODEL="claude-sonnet-5"

echo "🧪 启动聚合站测试窗口..."
echo "   Base: $ANTHROPIC_BASE_URL"
echo "   主窗口不受影响，关闭此窗口即可退出测试"

# 全新 VS Code 窗口，独立 user-data，不影响主窗口
/Applications/Visual\ Studio\ Code.app/Contents/MacOS/Electron \
  --user-data-dir /tmp/vscode-agg-test \
  --profile test-aggregator \
  "$@" 2>/dev/null &
