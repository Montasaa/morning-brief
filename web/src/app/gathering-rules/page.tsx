// The Owner's Gathering Rules (ticket 11): every Topic, private ones included,
// with who created it, how many Readers follow it (Topics nobody follows are
// not gathered) and its rules, which the Owner can edit. The house source rules
// apply to every Topic and are shown on top.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppContext } from "@/server/app";
import { requireReaderPage } from "@/server/readers/page-session";
import { HOUSE_SOURCE_RULES, listTopicsForOwner } from "@/server/topics/gathering-rules";
import { T } from "../_components/language";
import { RulesEditor } from "./rules-editor";

export const dynamic = "force-dynamic";

export default async function GatheringRulesPage() {
  const reader = await requireReaderPage();
  if (reader.role !== "owner") redirect("/");
  const ctx = getAppContext();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px calc(24px + var(--tabbar-h))" }}>
      <p style={{ margin: "0 0 8px", fontSize: 14 }}>
        <Link href="/me">
          <T en="← Me" ar="→ أنا" />
        </Link>
      </p>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>
        <T en="Gathering Rules" ar="قواعد الجمع" />
      </h1>
      <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 14 }}>
        <T
          en="How each Topic is gathered. Only Topics someone follows are gathered; edits apply from the next Edition."
          ar="طريقة جمع كل موضوع. لا يُجمع إلا ما يتابعه أحد، وتسري التعديلات من الإصدار التالي."
        />
      </p>
      <details style={{ margin: "0 0 20px", fontSize: 14 }}>
        <summary>
          <T en="House source rules (apply to every Topic)" ar="قواعد المصادر العامة (تنطبق على كل موضوع)" />
        </summary>
        <p dir="ltr" style={{ whiteSpace: "pre-line", color: "var(--muted)" }}>
          {HOUSE_SOURCE_RULES}
        </p>
      </details>
      <RulesEditor basePath={ctx.config.basePath} initial={listTopicsForOwner(ctx)} />
    </main>
  );
}
