import { deleteMemory, listMemory } from "@/lib/db/session-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ memory: listMemory() });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id wajib" }, { status: 400 });
  deleteMemory(id);
  return Response.json({ ok: true, memory: listMemory() });
}