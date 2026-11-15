"use client";
// The Reels look's bottom sheet (rework ticket 08, spec #6): the read sheet,
// the hide-reason sheet and the Ask sheet on a phone all use it, and so can the
// Story Thread sheet later.
//
//   <Sheet label="Why hide this?" title="Why hide this?" onClose={close}>…</Sheet>
//
// - It is rendered into <body>, outside the Brief canvas, so it follows the
//   Reader's theme (chrome colours) while the Brief behind it stays dark.
// - It rises from the bottom (centred as a dialog from 1024px wide), and can
//   be dragged down by its handle or anywhere not interactive to close; Esc and
//   the scrim close it too. Under reduced motion it just appears and goes.
// - It is a modal dialog: focus moves into it (to `initialFocus`, else the
//   sheet itself) and goes back where it was when it closes. While one is open
//   the Swipe Brief leaves the keys alone (see `sheetOpen`).
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { useLanguage } from "./language";
import s from "./sheet.module.css";

/** How far (px) the sheet must be dragged down to close. */
const DRAG_TO_CLOSE = 110;
/** The closing animation's length, in sheet.module.css. */
const CLOSE_MS = 240;

export function Sheet({
  label,
  title,
  onClose,
  initialFocus,
  className,
  children,
}: {
  /** The dialog's accessible name. */
  label: string;
  /** A visible heading, beside the close button (leave out when the content has its own). */
  title?: ReactNode;
  onClose(): void;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const sheet = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; id: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    if (prefersReducedMotion()) return onCloseRef.current();
    setLeaving(true);
    setTimeout(() => onCloseRef.current(), CLOSE_MS);
  }, []);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    (initialFocus?.current ?? sheet.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.({ preventScroll: true });
    };
    // Mounted once per opening.
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (sheet.current!.scrollTop > 0 || target.closest("button, a, input, textarea, select, label")) return;
    start.current = { y: e.clientY, id: e.pointerId };
    sheet.current!.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag(Math.max(0, e.clientY - start.current.y));
  };
  const onPointerEnd = () => {
    if (!start.current) return;
    start.current = null;
    if ((drag ?? 0) > DRAG_TO_CLOSE) close();
    setDrag(null);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`${s.layer} ${leaving ? s.leaving : ""}`}>
      <button type="button" className={s.scrim} aria-label={t("Close", "إغلاق")} tabIndex={-1} onClick={close} />
      <div
        ref={sheet}
        className={`${s.sheet} ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-dragging={drag !== null || undefined}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className={s.grab} data-testid="sheet-handle" aria-hidden />
        <div className={s.head}>
          {title !== undefined && <h2 className={s.title}>{title}</h2>}
          <button type="button" className={s.close} aria-label={t("Close", "إغلاق")} onClick={close}>
            <Icon name="x" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Whether a sheet is open: keyboard shortcuts behind it should do nothing. */
export function sheetOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
