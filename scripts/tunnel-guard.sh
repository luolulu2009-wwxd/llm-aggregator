#!/bin/bash
# SSH Tunnel Guardian — keeps the OpenRouter tunnel alive
# Runs on the aggregator server, checks every 30s, recreates if dead
#
# Usage: nohup bash scripts/tunnel-guard.sh &
# PM2:    pm2 start scripts/tunnel-guard.sh --name tunnel-guard --interpreter bash

TUNNEL_PORT=18443
TARGET="openrouter.ai:443"
PROXY_HOST="74.211.99.26"
MAX_FAILS=3
FAIL_COUNT=0

log() { echo "[tunnel-guard] $(date '+%H:%M:%S') $1"; }

check_tunnel() {
    # Test if tunnel can actually reach OpenRouter
    curl -s -m 5 -o /dev/null -w '%{http_code}' --connect-to "openrouter.ai:443:127.0.0.1:${TUNNEL_PORT}" \
        -k https://openrouter.ai/api/v1/models 2>/dev/null | grep -q '200'
}

restart_tunnel() {
    log "Restarting tunnel..."
    fuser -k ${TUNNEL_PORT}/tcp 2>/dev/null
    sleep 1
    ssh -f -N -L ${TUNNEL_PORT}:${TARGET} root@${PROXY_HOST} \
        -o StrictHostKeyChecking=no \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=2 \
        -o ConnectTimeout=10 2>&1
    sleep 2
}

log "Guardian started (port ${TUNNEL_PORT} → ${PROXY_HOST} → ${TARGET})"

while true; do
    if check_tunnel; then
        FAIL_COUNT=0
        sleep 30
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        log "Tunnel check failed (${FAIL_COUNT}/${MAX_FAILS})"
        if [ $FAIL_COUNT -ge $MAX_FAILS ]; then
            restart_tunnel
            FAIL_COUNT=0
        fi
        sleep 10
    fi
done
