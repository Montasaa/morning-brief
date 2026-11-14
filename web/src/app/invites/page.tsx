// The Owner's Invites: invite someone by email, see who is pending, accepted
// or revoked, and revoke access.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { listInvites } from "@/server/readers/invites";
import { requireReaderPage } from "@/server/readers/page-session";
import { InvitesManager } from "./invites-manager";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const reader = await requireReaderPage();
  if (reader.role !== "owner") redirect("/");
  const ctx = getAppContext();

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ margin: "0 0 8px", fontSize: 14 }}>
        <Link href="/">← Brief</Link>
      </p>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Invites</h1>
      <p style={{ margin: "0 0 20px", color: "var(--muted)", fontSize: 14 }}>
        Only people you invite can read. They get an email with a sign-in link.
      </p>
      <InvitesManager basePath={ctx.config.basePath} initial={listInvites(ctx)} />
    </main>
  );
}
