// The bare Brief: the latest Edition's Item titles, newest first.
// Ticket 03 replaces this with the Swipe Brief.
import { getAppContext } from "@/server/app";
import { composeBrief } from "@/server/brief/compose";
import { requireReaderPage } from "@/server/readers/page-session";
import { AccountBar } from "./_components/account-bar";

export const dynamic = "force-dynamic";

export default async function BriefPage() {
  const reader = await requireReaderPage();
  const ctx = getAppContext();
  const brief = composeBrief(ctx);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <AccountBar reader={reader} basePath={ctx.config.basePath} />
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Morning Brief</h1>
      {brief.edition ? (
        <>
          <p data-testid="edition" style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 14 }}>
            {brief.edition.kind === "morning" ? "Morning" : "Evening"} Edition · {brief.edition.item_count} Items
          </p>
          <ol aria-label="Brief" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {brief.items.map((item) => (
              <li key={item.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
                {item.title}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p style={{ color: "var(--muted)" }}>No Edition yet. The next one arrives after the morning gathering run.</p>
      )}
    </main>
  );
}
