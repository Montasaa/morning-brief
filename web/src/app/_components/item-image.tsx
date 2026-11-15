"use client";
// An Item's picture from the Edition (external, already link-checked; next/image
// would need every host allow-listed). `onFail` is called when it cannot be
// shown, including when it failed while the page was loading, before React was
// running to hear the error event. Callers fall back to the plain gradient.
//
// <MediaVeil> and useMediaVeil are explicit media's own veil (rework ticket
// 10): an Item marked `media_blurred` keeps its picture blurred under it until
// tapped, even when the Reader turned the blur off for its Topic and its text
// shows.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { useLanguage } from "./language";

export function ItemImage({ src, className, onFail }: { src: string; className?: string; onFail(): void }) {
  const img = useRef<HTMLImageElement>(null);
  const fail = useRef(onFail);
  fail.current = onFail;
  useEffect(() => {
    // A lazy image not fetched yet is not `complete`; a finished one with no size failed.
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) fail.current();
  }, [src]);
  return <img ref={img} className={className} src={src} alt="" loading="lazy" decoding="async" onError={() => fail.current()} />;
}

/**
 * Whether an Item's picture is still behind its media veil: it is `media_blurred` and has a picture to show
 * (`hasPicture`), and the Reader has not tapped it open since `resetWhen` last turned true.
 */
export function useMediaVeil(
  item: { media_blurred: boolean },
  hasPicture: boolean,
  resetWhen = false,
): { locked: boolean; reveal(): void } {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (resetWhen) setRevealed(false);
  }, [resetWhen]);
  return { locked: item.media_blurred && hasPicture && !revealed, reveal: () => setRevealed(true) };
}

/**
 * The button over a `media_blurred` Item's blurred picture: an eye, "Explicit media" and "Tap to view".
 * The caller blurs the picture itself and styles the button (`className`).
 */
export function MediaVeil({ className, onReveal }: { className?: string; onReveal(): void }) {
  const { t } = useLanguage();
  return (
    <button type="button" className={className} data-testid="media-veil" onClick={onReveal}>
      <Icon name="hide" size={26} />
      <span>{t("Explicit media", "وسائط صريحة")}</span>
      <em>{t("Tap to view", "اضغط للعرض")}</em>
    </button>
  );
}
