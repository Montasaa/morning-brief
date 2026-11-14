// Shared inline styles for the plain account screens (sign-in, Invites).
// Ticket 03 owns the Brief's look; these stay deliberately simple.
import type { CSSProperties } from "react";

export const inputStyle: CSSProperties = {
  font: "inherit",
  padding: "12px 14px",
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--rule)",
  background: "transparent",
  color: "inherit",
  width: "100%",
};

export const buttonStyle: CSSProperties = {
  font: "inherit",
  fontWeight: 600,
  padding: "12px 16px",
  minHeight: 44,
  borderRadius: 10,
  border: "none",
  background: "var(--fg)",
  color: "var(--bg)",
  cursor: "pointer",
};

export const quietButtonStyle: CSSProperties = {
  font: "inherit",
  fontSize: 14,
  padding: "8px 12px",
  minHeight: 36,
  borderRadius: 8,
  border: "1px solid var(--rule)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};
