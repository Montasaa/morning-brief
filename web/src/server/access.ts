// Access checks for route handlers. Reader routes need a signed-in session;
// Owner routes need the Owner's session; pipeline routes use the bearer token
// instead (see pipeline-auth.ts).
//
//   export async function GET(req: Request) {
//     const ctx = getAppContext();
//     const access = readerAccess(ctx, req);
//     if (!access.ok) return access.response;
//     ... access.reader ...
//   }
import type { AppContext } from "./app";
import type { Reader } from "./readers/readers";
import { readerForSession, sessionTokenFrom } from "./readers/sessions";

export type { Reader } from "./readers/readers";

export type Access = { ok: true; reader: Reader } | { ok: false; response: Response };

/** The signed-in Reader, or a 401 to return. */
export function readerAccess(ctx: AppContext, req: Request): Access {
  const reader = readerForSession(ctx, sessionTokenFrom(req));
  if (!reader) {
    return { ok: false, response: Response.json({ error: "Sign in to read your Brief." }, { status: 401 }) };
  }
  return { ok: true, reader };
}

/** The signed-in Owner, or a 401 (signed out) or 403 (another Reader) to return. */
export function ownerAccess(ctx: AppContext, req: Request): Access {
  const access = readerAccess(ctx, req);
  if (!access.ok) return access;
  if (access.reader.role !== "owner") {
    return { ok: false, response: Response.json({ error: "Only the Owner can do this." }, { status: 403 }) };
  }
  return access;
}

/** A plain HTML form post (as opposed to a JSON API call). */
export function isFormPost(req: Request): boolean {
  const type = req.headers.get("content-type") ?? "";
  return type.startsWith("application/x-www-form-urlencoded") || type.startsWith("multipart/form-data");
}

/** 303 See Other to a path inside the app (already including the base path). */
export function seeOther(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store", ...headers } });
}

/**
 * The fields of a plain HTML form post or a JSON body, as one object, or null
 * when a JSON body does not parse. Form values that are files are left out.
 */
export async function readFields(req: Request): Promise<Record<string, unknown> | null> {
  try {
    if (isFormPost(req)) {
      const fields: Record<string, unknown> = {};
      for (const [name, value] of await req.formData()) if (typeof value === "string") fields[name] = value;
      return fields;
    }
    const body: unknown = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}
