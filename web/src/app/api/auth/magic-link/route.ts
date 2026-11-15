// POST /api/auth/magic-link {email}: email a sign-in link if this email may
// sign in. The answer is the same either way, so it never reveals who is invited.
// The sign-in page posts it as a plain HTML form, answered with a redirect.
import { isFormPost, publicOrigin, seeOther } from "@/server/access";
import { getAppContext } from "@/server/app";
import { requestMagicLink } from "@/server/readers/sign-in";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const form = isFormPost(req);
  let email: unknown;
  try {
    if (form) email = (await req.formData()).get("email");
    else {
      const body: unknown = await req.json();
      email = body && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
    }
  } catch {
    return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
  }
  const result = await requestMagicLink(ctx, email, publicOrigin(ctx, req));
  if (form) return seeOther(`${ctx.config.basePath}/sign-in?${result.ok ? "sent=1" : "error=email"}`);
  if (!result.ok) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  return Response.json({ requested: true });
}
