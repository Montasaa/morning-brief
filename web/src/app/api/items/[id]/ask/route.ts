// GET /api/items/{id}/ask: the signed-in Reader's own questions and answers about this Item, and what is left today.
// POST /api/items/{id}/ask {question}: ask Claude about the Item. 201 with the answer and its cited links;
// 429 once today's limit is used; 502 if Claude could not answer (not counted).
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { askAboutItem, listAsks, MAX_QUESTION_LENGTH } from "@/server/ask/ask";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const NO_SUCH_ITEM = { error: "No such Item." };

export async function GET(req: Request, { params }: Params): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const { id } = await params;
  const result = listAsks(ctx, access.reader, id);
  if (!result.ok) return Response.json(NO_SUCH_ITEM, { status: 404 });
  return Response.json({ item_id: result.item_id, asks: result.asks, ask_limit: result.ask_limit });
}

export async function POST(req: Request, { params }: Params): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
  }
  const question = body && typeof body === "object" ? (body as { question?: unknown }).question : undefined;
  const result = await askAboutItem(ctx, access.reader, id, question);
  if (result.ok) return Response.json({ ask: result.ask, ask_limit: result.ask_limit }, { status: 201 });
  switch (result.reason) {
    case "invalid-question":
      return Response.json({ error: `Write a question of up to ${MAX_QUESTION_LENGTH} characters.` }, { status: 400 });
    case "no-such-item":
      return Response.json(NO_SUCH_ITEM, { status: 404 });
    case "limit-reached":
      return Response.json(
        { error: "You have used today's questions. They reset at midnight, Riyadh time.", ask_limit: result.ask_limit },
        { status: 429 },
      );
    case "claude-failed":
      return Response.json(
        { error: "Claude could not answer just now. Try again; this question was not counted.", ask_limit: result.ask_limit },
        { status: 502 },
      );
  }
}
