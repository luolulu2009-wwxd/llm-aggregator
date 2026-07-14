import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-6">
      <h1 className="text-5xl font-bold tracking-tight">LLM Aggregator</h1>
      <p className="text-xl text-zinc-500 max-w-md">
        一个 API Key，调用 7 个大模型。智能路由，自动切换。
      </p>
      <div className="flex gap-4">
        <Link href="/login" className="rounded-lg bg-zinc-900 text-white px-6 py-3 font-medium hover:bg-zinc-800">
          开始使用 →
        </Link>
        <a href="https://github.com/luolulu2009-wwxd/llm-aggregator" target="_blank"
          className="rounded-lg border border-zinc-300 px-6 py-3 font-medium hover:bg-zinc-50">
          GitHub
        </a>
      </div>
      <div className="flex gap-3 text-sm text-zinc-400">
        <span>DeepSeek</span><span>·</span><span>Claude Sonnet 5</span><span>·</span>
        <span>GPT-4o</span><span>·</span><span>Qwen</span><span>·</span>
        <span>GLM-4</span><span>·</span><span>Doubao</span>
      </div>
    </main>
  );
}
