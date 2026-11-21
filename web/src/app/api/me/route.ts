// GET /api/me: the signed-in Reader's Interest Profile (followed Topics,
// language, city), their Display, and whether they have finished onboarding.
// PATCH /api/me {topics?, language?, city?, onboarded?, notifications?, display?}: change it; all or
// nothing, 422 with reasons for bad values.
import { readerAccess } from "@/server/access";
import { getAppContext } from "@/server/app";
import { getProfile, updateProfile } from "@/server/readers/profile";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  return Response.json(getProfile(ctx, access.reader));
}

export async function PATCH(req: Request): Promise<Response> {
  const ctx = getAppContext();
  const access = readerAccess(ctx, req);
  if (!access.ok) return access.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON", reasons: ["Body is not valid JSON."] }, { status: 422 });
  }
  const result = updateProfile(ctx, access.reader, body);
  if (!result.ok) return Response.json({ error: result.error, reasons: result.reasons }, { status: 422 });
  return Response.json(result.profile);
}
