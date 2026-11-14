// The signed-in Reader for pages (Server Components). Route handlers use
// readerAccess() in src/server/access.ts instead, which reads the request.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAppContext } from "../app";
import type { Reader } from "./readers";
import { readerForSession, SESSION_COOKIE } from "./sessions";

export async function currentReader(): Promise<Reader | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return readerForSession(getAppContext(), token);
}

/** The signed-in Reader, or a redirect to the sign-in page. */
export async function requireReaderPage(): Promise<Reader> {
  const reader = await currentReader();
  if (!reader) redirect("/sign-in");
  return reader;
}
