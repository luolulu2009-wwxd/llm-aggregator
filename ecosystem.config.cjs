module.exports = {
  apps: [{
    name: 'topup-worker',
    script: 'scripts/auto-topup-worker.ts',
    interpreter: 'npx',
    interpreter_args: 'tsx',
    env: {
      DATABASE_URL: 'postgresql://aggregator:VPSpwd2026!@localhost:5432/llm_aggregator?schema=public',
      USDT_ADDRESS: 'TYfZVyGw3AULPRS7pPJbb9rjtid5fYgRs5',
    },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
  }]
};
