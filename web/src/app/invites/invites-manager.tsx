"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Invite } from "@/server/readers/invites";
import { useLanguage } from "../_components/language";
import { buttonStyle, inputStyle, quietButtonStyle } from "../_components/styles";

const STATUS_LABEL: Record<Invite["status"], [en: string, ar: string]> = {
  pending: ["Pending", "بانتظار القبول"],
  accepted: ["Reader", "قارئ"],
  revoked: ["Revoked", "ملغاة"],
};

export function InvitesManager({ basePath, initial }: { basePath: string; initial: Invite[] }) {
  const { t } = useLanguage();
  const [invites, setInvites] = useState(initial);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Buttons stay disabled until React is running, so an early tap is not lost.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function reload() {
    const res = await fetch(`${basePath}/api/invites`);
    if (res.ok) setInvites((await res.json()).invites);
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${basePath}/api/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(
          t(
            `Invited ${body.invite.email}. They've been emailed a sign-in link.`,
            `تمت دعوة ${body.invite.email}. أُرسل إليه رابط تسجيل الدخول.`,
          ),
        );
        setEmail("");
        await reload();
      } else {
        setMessage(body.error ?? t("Could not send the Invite.", "تعذّر إرسال الدعوة."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(item: Invite) {
    const what =
      item.status === "accepted"
        ? t(
            `Revoke ${item.email}? They will be signed out and can't sign in again.`,
            `إلغاء وصول ${item.email}؟ سيُسجَّل خروجه ولن يتمكن من الدخول مجددًا.`,
          )
        : t(`Revoke the Invite for ${item.email}?`, `إلغاء دعوة ${item.email}؟`);
    if (!window.confirm(what)) return;
    await fetch(`${basePath}/api/invites/${item.id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <>
      <form onSubmit={invite} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ flex: "1 1 220px" }}>
          <input
            type="email"
            required
            placeholder="name@example.com"
            dir="ltr"
            aria-label={t("Email to invite", "البريد المراد دعوته")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={!ready || busy} style={buttonStyle}>
          {t("Invite", "دعوة")}
        </button>
      </form>
      {message && (
        <p role="status" style={{ margin: "0 0 16px" }}>
          {message}
        </p>
      )}
      {invites.length === 0 ? (
        <p style={{ color: "var(--mute)" }}>{t("No Invites yet.", "لا توجد دعوات بعد.")}</p>
      ) : (
        <ul aria-label={t("Invites", "الدعوات")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {invites.map((item) => (
            <li
              key={item.id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}
            >
              <span dir="ltr" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.email}
              </span>
              <span style={{ color: "var(--mute)", fontSize: "var(--fs-s)" }}>{t(...STATUS_LABEL[item.status])}</span>
              {item.status !== "revoked" && (
                <button type="button" disabled={!ready} onClick={() => revoke(item)} style={quietButtonStyle}>
                  {t("Revoke", "إلغاء")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
