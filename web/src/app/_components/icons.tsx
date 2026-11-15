// The Reels look's line icons (spec #6, from the round-2 prototype): 24×24,
// stroked in currentColor. `<Icon name="heart" />`; `filled` fills the shape
// (a pressed Like or Save). Decorative: always aria-hidden, so the button or
// row around an icon carries its name.
const PATHS = {
  heart:
    "M12 20.3s-7.6-4.7-9.4-9.3C1.3 7.6 3.5 4.3 7 4.3c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.5 0 5.7 3.3 4.4 6.7-1.8 4.6-9.4 9.3-9.4 9.3z",
  save: "M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.2L5.5 21V4.5a1 1 0 0 1 1-1z",
  sparkle: "M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9zM18.5 15v5M16 17.5h5",
  hide: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-2.6 3.4M6.6 6.6C3.9 8.4 2.5 12 2.5 12s3.5 7 9.5 7c1.8 0 3.4-.5 4.8-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2",
  threads: "M4 6h16M4 12h9M4 18h6M21 16.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  up: "m6 15 6-6 6 6",
  x: "M18 6 6 18M6 6l12 12",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  ball: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7.5l3.8 2.8-1.4 4.5H9.6L8.2 10.3zM12 3v4.5M20.6 9.5l-4.8.8M17.5 19.5l-3.1-4.7M6.5 19.5l3.1-4.7M3.4 9.5l4.8.8",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  filled = false,
  className,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <path
        d={PATHS[name]}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
