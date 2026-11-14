// The Owner console (ticket 10): ingest health (the latest Edition, rejected
// ingests) and "bad source" reports from Readers' hides. Owner only; other
// Readers are sent back to their Brief.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { ingestHealth } from "@/server/owner/health";
import { badSourceReports } from "@/server/owner/reports";
import { requireReaderPage } from "@/server/readers/page-session";
import { T } from "../_components/language";
import { OwnerConsole } from "./owner-console";
import s from "./owner-console.module.css";

export const dynamic = "force-dynamic";

export default async function OwnerConsolePage() {
  const reader = await requireReaderPage();
  if (reader.role !== "owner") redirect("/");
  const ctx = getAppContext();

  return (
    <main className={s.screen}>
      <p className={s.back}>
        <Link href="/me">
          <T en="← Me" ar="→ أنا" />
        </Link>
      </p>
      <h1>
        <T en="Owner console" ar="لوحة المالك" />
      </h1>
      <OwnerConsole health={ingestHealth(ctx)} reports={badSourceReports(ctx)} />
    </main>
  );
}
