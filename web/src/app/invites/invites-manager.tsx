"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Invite } from "@/server/readers/invites";
import { buttonStyle, inputStyle, quietButtonStyle } from "../_components/styles";

const STATUS_LABEL: Record<Invite["status"], string> = {
  pending: "Pending",
  accepted: "Reader",
  revoked: "Revoked",
};

export function InvitesManager({ basePath, initial }: { basePath: string; initial: Invite[] }) {
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
        setMessage(`Invited ${body.invite.email}. They've been emailed a sign-in link.`);
        setEmail("");
        await reload();
      } else {
        setMessage(body.error ?? "Could not send the Invite.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(item: Invite) {
    const what = item.status === "accepted" ? `Revoke ${item.email}? They will be signed out and can't sign in again.` : `Revoke the Invite for ${item.email}?`;
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
            aria-label="Email to invite"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={!ready || busy} style={buttonStyle}>
          Invite
        </button>
      </form>
      {message && (
        <p role="status" style={{ margin: "0 0 16px" }}>
          {message}
        </p>
      )}
      {invites.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No Invites yet.</p>
      ) : (
        <ul aria-label="Invites" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {invites.map((item) => (
            <li
              key={item.id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--rule)" }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{item.email}</span>
              <span style={{ color: "var(--muted)", fontSize: 14 }}>{STATUS_LABEL[item.status]}</span>
              {item.status !== "revoked" && (
                <button type="button" disabled={!ready} onClick={() => revoke(item)} style={quietButtonStyle}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
