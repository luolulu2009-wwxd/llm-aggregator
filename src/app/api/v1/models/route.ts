const MODELS = [
  {
    id: "deepseek/deepseek-chat",
    object: "model",
    created: 1700000000,
    owned_by: "deepseek",
  },
  {
    id: "deepseek/deepseek-reasoner",
    object: "model",
    created: 1700000000,
    owned_by: "deepseek",
  },
];

export async function GET() {
  return Response.json({
    object: "list",
    data: MODELS,
  });
}
