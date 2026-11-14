// A small bar with the signed-in Reader, the Owner's Invites link and Sign out.
// Ticket 03's Me tab is its long-term home. Sign out is a plain form post.
import Link from "next/link";
import type { Reader } from "@/server/readers/readers";
import { quietButtonStyle } from "./styles";

export function AccountBar({ reader, basePath }: { reader: Reader; basePath: string }) {
  return (
    <nav
      aria-label="Account"
      style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", fontSize: 14, color: "var(--muted)" }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{reader.email}</span>
      {reader.role === "owner" && <Link href="/invites">Invites</Link>}
      <form method="post" action={`${basePath}/api/auth/sign-out`} style={{ margin: 0 }}>
        <button type="submit" style={quietButtonStyle}>
          Sign out
        </button>
      </form>
    </nav>
  );
}
