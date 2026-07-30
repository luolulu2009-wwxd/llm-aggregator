module.exports = {
  apps: [{
    name: "llm",
    script: "npx",
    args: "next start",
    cwd: "/root/llm-aggregator",
    env: {
      NODE_ENV: "production",
      OPENROUTER_PROXY: "http://127.0.0.1:3001",
    }
  }]
};
