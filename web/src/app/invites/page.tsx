// The Owner's Invites: invite someone by email, see who is pending, accepted
// or revoked, and revoke access.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { askUsage } from "@/server/ask/limits";
import { listInvites } from "@/server/readers/invites";
import { requireReaderPage } from "@/server/readers/page-session";
import { T } from "../_components/language";
import { AskLimitsManager } from "./ask-limits-manager";
import { InvitesManager } from "./invites-manager";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const reader = await requireReaderPage();
  if (reader.role !== "owner") redirect("/");
  const ctx = getAppContext();

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px calc(24px + var(--tabbar-h))" }}>
      <p style={{ margin: "0 0 8px", fontSize: "var(--fs-s)" }}>
        <Link href="/me">
          <T en="← Me" ar="→ أنا" />
        </Link>
      </p>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>
        <T en="Invites" ar="الدعوات" />
      </h1>
      <p style={{ margin: "0 0 20px", color: "var(--mute)", fontSize: "var(--fs-s)" }}>
        <T
          en="Only people you invite can read. They get an email with a sign-in link."
          ar="لا يقرأ إلا من تدعوهم. يصلهم بريد فيه رابط تسجيل الدخول."
        />
      </p>
      <InvitesManager basePath={ctx.config.basePath} initial={listInvites(ctx)} />
      <h2 style={{ fontSize: "var(--fs-l)", margin: "32px 0 4px" }}>
        <T en="Ask limits" ar="حدود الأسئلة" />
      </h2>
      <p style={{ margin: "0 0 12px", color: "var(--mute)", fontSize: "var(--fs-s)" }}>
        <T
          en="Questions each Reader may ask Claude a day (default 20; resets at midnight, Riyadh time). You have no limit."
          ar="عدد الأسئلة التي يطرحها كل قارئ على Claude يوميًا (الافتراضي ٢٠، وتتجدد عند منتصف الليل بتوقيت الرياض). لا حدّ لك."
        />
      </p>
      <AskLimitsManager basePath={ctx.config.basePath} initial={askUsage(ctx)} />
    </main>
  );
}
