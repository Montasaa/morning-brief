"use client";
// A small bar with the signed-in Reader, the Owner's Invites link and Sign out,
// at the top of the Me tab. Sign out is a plain form post.
import Link from "next/link";
import type { Reader } from "@/server/readers/readers";
import { useLanguage } from "./language";
import { quietButtonStyle } from "./styles";

export function AccountBar({ reader, basePath }: { reader: Reader; basePath: string }) {
  const { t } = useLanguage();
  return (
    <nav
      aria-label={t("Account", "الحساب")}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "flex-end",
        margin: "0 0 16px",
        fontSize: 14,
        color: "var(--muted)",
      }}
    >
      <span dir="ltr" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {reader.email}
      </span>
      {reader.role === "owner" && <Link href="/invites">{t("Invites", "الدعوات")}</Link>}
      <form method="post" action={`${basePath}/api/auth/sign-out`} style={{ margin: 0 }}>
        <button type="submit" style={quietButtonStyle}>
          {t("Sign out", "تسجيل الخروج")}
        </button>
      </form>
    </nav>
  );
}
