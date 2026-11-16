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

/** The server's refusals (`reason`), in both languages. */
const REFUSAL: Record<string, [en: string, ar: string]> = {
  "invalid-email": ["Enter a valid email address.", "أدخل عنوان بريد صحيحًا."],
  "too-short": ["Use at least 8 characters for the password.", "استخدم ٨ أحرف على الأقل لكلمة المرور."],
  "too-long": ["Use at most 200 characters for the password.", "استخدم ٢٠٠ حرف على الأكثر لكلمة المرور."],
  "already-a-reader": ["This email already belongs to a Reader.", "هذا البريد لقارئ بالفعل."],
  "not-a-reader": ["Only an active Reader's password can be reset.", "لا يمكن إعادة تعيين كلمة المرور إلا لقارئ نشط."],
  "not-found": ["That Invite no longer exists.", "لم تعد هذه الدعوة موجودة."],
};

// The Owner chooses these passwords to tell someone, so they are shown as typed.
const passwordInput = {
  type: "text",
  dir: "ltr",
  autoComplete: "off",
  autoCapitalize: "none",
  spellCheck: false,
  minLength: 8,
  required: true,
} as const;

export function InvitesManager({ basePath, initial }: { basePath: string; initial: Invite[] }) {
  const { t } = useLanguage();
  const [invites, setInvites] = useState(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetting, setResetting] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Buttons stay disabled until React is running, so an early tap is not lost.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const refusal = (body: { reason?: string }, en: string, ar: string) =>
    body.reason && REFUSAL[body.reason] ? t(...REFUSAL[body.reason]!) : t(en, ar);

  async function reload() {
    const res = await fetch(`${basePath}/api/invites`);
    if (res.ok) setInvites((await res.json()).invites);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${basePath}/api/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(
          t(
            `Added ${body.invite.email}. Tell them their password; they can sign in now.`,
            `تمت إضافة ${body.invite.email}. أخبره بكلمة المرور؛ يمكنه تسجيل الدخول الآن.`,
          ),
        );
        setEmail("");
        setPassword("");
        await reload();
      } else {
        setMessage(refusal(body, "Could not add this Reader.", "تعذّرت إضافة هذا القارئ."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent, item: Invite) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${basePath}/api/invites/${item.id}/password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(
          t(
            `New password set for ${item.email}. Tell them; their devices have been signed out.`,
            `تم تعيين كلمة مرور جديدة لـ ${item.email}. أخبره بها؛ وقد سُجّل خروجه من أجهزته.`,
          ),
        );
        setResetting(null);
        setNewPassword("");
      } else {
        setMessage(refusal(body, "Could not reset the password.", "تعذّرت إعادة تعيين كلمة المرور."));
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
    if (resetting === item.id) setResetting(null);
    await reload();
  }

  return (
    <>
      <form
        onSubmit={add}
        aria-label={t("Add a Reader", "إضافة قارئ")}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
      >
        <label style={{ flex: "1 1 220px" }}>
          <input
            type="email"
            required
            placeholder="name@example.com"
            dir="ltr"
            aria-label={t("Reader's email", "بريد القارئ")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ flex: "1 1 160px" }}>
          <input
            {...passwordInput}
            placeholder={t("Password (8+ characters)", "كلمة المرور (٨ أحرف أو أكثر)")}
            aria-label={t("Their password", "كلمة مروره")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={!ready || busy} style={buttonStyle}>
          {t("Add Reader", "إضافة قارئ")}
        </button>
      </form>
      {message && (
        <p role="status" style={{ margin: "0 0 16px" }}>
          {message}
        </p>
      )}
      {invites.length === 0 ? (
        <p style={{ color: "var(--mute)" }}>{t("No Readers yet.", "لا يوجد قرّاء بعد.")}</p>
      ) : (
        <ul aria-label={t("Invites", "الدعوات")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {invites.map((item) => (
            <li key={item.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span dir="ltr" style={{ flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.email}
                </span>
                <span style={{ color: "var(--mute)", fontSize: "var(--fs-s)" }}>{t(...STATUS_LABEL[item.status])}</span>
                {item.status === "accepted" && (
                  <button
                    type="button"
                    disabled={!ready}
                    aria-expanded={resetting === item.id}
                    onClick={() => {
                      setResetting(resetting === item.id ? null : item.id);
                      setNewPassword("");
                    }}
                    style={quietButtonStyle}
                  >
                    {t("Reset password", "إعادة تعيين كلمة المرور")}
                  </button>
                )}
                {item.status !== "revoked" && (
                  <button type="button" disabled={!ready} onClick={() => revoke(item)} style={quietButtonStyle}>
                    {t("Revoke", "إلغاء")}
                  </button>
                )}
              </div>
              {resetting === item.id && (
                <form
                  onSubmit={(e) => resetPassword(e, item)}
                  style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}
                >
                  <label style={{ flex: "1 1 200px" }}>
                    <input
                      {...passwordInput}
                      autoFocus
                      aria-label={t(`New password for ${item.email}`, `كلمة مرور جديدة لـ ${item.email}`)}
                      placeholder={t("New password (8+ characters)", "كلمة المرور الجديدة (٨ أحرف أو أكثر)")}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                  <button type="submit" disabled={busy} style={quietButtonStyle}>
                    {t("Save password", "حفظ كلمة المرور")}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
