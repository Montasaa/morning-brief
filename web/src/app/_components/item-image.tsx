"use client";
// An Item's picture from the Edition (external, already link-checked; next/image
// would need every host allow-listed). `onFail` is called when it cannot be
// shown, including when it failed while the page was loading, before React was
// running to hear the error event. Callers fall back to the plain gradient.
import { useEffect, useRef } from "react";

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
