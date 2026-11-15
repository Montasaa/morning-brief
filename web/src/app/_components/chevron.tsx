// The quiet chevron on chrome rows and back links (rework ticket 07). It points
// to the end side ("forward") or the start side ("back"), and mirrors in Arabic
// (chrome.module.css flips .chevron under dir="rtl").
import c from "./chrome.module.css";

export function Chevron({ to, size = 20 }: { to: "forward" | "back"; size?: number }) {
  return (
    <svg className={c.chevron} viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        d={to === "forward" ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
