// Display formatting for the Brief. English only until ticket 04 (Arabic).
// Dates and times are shown in Asia/Riyadh, the Editions' time zone.
import type { Brief } from "@/server/brief/compose";

const RIYADH = "Asia/Riyadh";

/** "Saturday 14 November" from the cover card's YYYY-MM-DD date. */
export function formatCoverDate(date: string): string {
  return new Date(`${date}T12:00:00+03:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: RIYADH,
  });
}

/** "Next Edition at 19:15", or "Next Edition tomorrow at 06:00" when it falls on the next day. */
export function formatNextEdition(brief: Brief): string {
  if (!brief.next_edition_at) return "";
  const at = brief.next_edition_at.slice(11, 16);
  const sameDay = brief.cover && brief.next_edition_at.startsWith(brief.cover.date);
  return sameDay ? `Next Edition at ${at}` : `Next Edition tomorrow at ${at}`;
}

/** "just now", "25m ago", "5h ago", "2d ago". */
export function timeSince(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
