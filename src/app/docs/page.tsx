export default function DocsPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-bold">API 文档</h1>
      <p className="text-zinc-500">
        完全兼容 OpenAI SDK，改 <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">base_url</code> 即可使用。
      </p>

      <Section title="快速开始">
        <CodeBlock>{`from openai import OpenAI

client = OpenAI(
  api_key="sk-your-key",
  base_url="https://llm.saylulu.com/api/v1"
)

response = client.chat.completions.create(
  model="deepseek/deepseek-chat",
  messages=[{"role": "user", "content": "你好"}]
)
print(response.choices[0].message.content)`}</CodeBlock>
      </Section>

      <Section title="可用模型">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Model ID</th><th className="text-left py-2">名称</th><th className="text-right py-2">输入/1M</th><th className="text-right py-2">输出/1M</th>
            </tr>
          </thead>
          <tbody>
            <ModelRow id="deepseek/deepseek-chat" name="DeepSeek Chat" inp="¥1" out="¥2" />
            <ModelRow id="deepseek/deepseek-reasoner" name="DeepSeek Reasoner" inp="¥4" out="¥16" />
            <ModelRow id="anthropic/claude-sonnet-5" name="Claude Sonnet 5" inp="¥21" out="¥105" />
            <ModelRow id="anthropic/claude-haiku-4-5" name="Claude Haiku 4.5" inp="¥7" out="¥35" />
            <ModelRow id="qwen/qwen-plus" name="Qwen Plus" inp="¥14" out="¥42" />
            <ModelRow id="glm/glm-4-flash" name="GLM-4 Flash" inp="¥7" out="¥7" />
          </tbody>
        </table>
      </Section>

      <Section title="智能路由">
        <p>不指定模型时平台自动选择：</p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">意图</th><th className="text-left py-2">关键词</th><th className="text-left py-2">默认模型</th>
            </tr>
          </thead>
          <tbody>
            <RouteRow intent="代码" keywords="写代码/函数/bug/算法" model="deepseek/deepseek-chat" />
            <RouteRow intent="翻译" keywords="翻译/translate" model="deepseek/deepseek-chat" />
            <RouteRow intent="推理" keywords="分析/为什么/数学" model="deepseek/deepseek-chat" />
            <RouteRow intent="创作" keywords="故事/文案/角色扮演" model="qwen/qwen-plus" />
            <RouteRow intent="摘要" keywords="总结/概括/summarize" model="deepseek/deepseek-chat" />
          </tbody>
        </table>
        <CodeBlock>{`# 自动路由
curl https://llm.saylulu.com/api/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -d '{"model":"auto","messages":[{"role":"user","content":"翻译成英文: 你好"}]}'

# 手动指定 + 备选
curl https://llm.saylulu.com/api/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -d '{"model":"anthropic/claude-sonnet-5","models":["deepseek/deepseek-chat"],"messages":[...]}'`}</CodeBlock>
      </Section>

      <Section title="Key 共享">
        <p>贡献你的 API Key 赚取 credits（×1.2 奖励）。上传和管理在 <a href="/dashboard/keys" className="underline">Keys 面板</a>。</p>
      </Section>

      <Section title="错误码">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="border-b"><th className="text-left py-2">HTTP</th><th className="text-left py-2">含义</th></tr></thead>
          <tbody>
            <tr className="border-b"><td className="py-1 font-mono">401</td><td className="py-1">API Key 无效或缺失</td></tr>
            <tr className="border-b"><td className="py-1 font-mono">402</td><td className="py-1">余额不足</td></tr>
            <tr className="border-b"><td className="py-1 font-mono">422</td><td className="py-1">内容安全拦截</td></tr>
            <tr className="border-b"><td className="py-1 font-mono">429</td><td className="py-1">请求频率过高</td></tr>
            <tr className="border-b"><td className="py-1 font-mono">503</td><td className="py-1">模型暂时不可用</td></tr>
          </tbody>
        </table>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="text-xl font-semibold">{title}</h2>{children}</section>;
}

function CodeBlock({ children }: { children: string }) {
  return <pre className="bg-zinc-950 text-green-400 p-4 rounded-xl text-sm overflow-x-auto"><code>{children}</code></pre>;
}

function ModelRow({ id, name, inp, out }: { id: string; name: string; inp: string; out: string }) {
  return <tr className="border-b"><td className="py-1 font-mono text-xs">{id}</td><td className="py-1">{name}</td><td className="py-1 text-right font-mono text-xs">{inp}</td><td className="py-1 text-right font-mono text-xs">{out}</td></tr>;
}

function RouteRow({ intent, keywords, model }: { intent: string; keywords: string; model: string }) {
  return <tr className="border-b"><td className="py-1 font-medium">{intent}</td><td className="py-1 text-zinc-500 text-xs">{keywords}</td><td className="py-1 font-mono text-xs">{model}</td></tr>;
}
