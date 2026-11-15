// Shared inline styles for the plain account screens (sign-in, Invites, Me).
// They use the Reels look's tokens (globals.css): pills for buttons, hairlines,
// and the theme's colours.
import type { CSSProperties } from "react";

export const inputStyle: CSSProperties = {
  font: "inherit",
  padding: "12px 14px",
  minHeight: 44,
  borderRadius: "var(--r-row)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "inherit",
  width: "100%",
};

export const buttonStyle: CSSProperties = {
  font: "inherit",
  fontWeight: 600,
  padding: "12px 18px",
  minHeight: 44,
  borderRadius: "var(--r-pill)",
  border: "none",
  background: "var(--fg)",
  color: "var(--bg)",
  cursor: "pointer",
};

export const quietButtonStyle: CSSProperties = {
  font: "inherit",
  fontSize: "var(--fs-s)",
  fontWeight: 600,
  padding: "8px 14px",
  minHeight: 36,
  borderRadius: "var(--r-pill)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};
