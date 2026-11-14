"use client";
// The Swipe Brief (prototype variant B): a cover card, then one Item per
// screen, then "You're caught up". Tap the right side to go forward and the
// left side to go back. Progress bars (one per group of the Brief) and a
// Topic/position chip sit on top; the dock (Hide, Save, Like, Ask) sits at the
// bottom and does nothing until ticket 09 (Reactions) and 16 (Ask).
import { useEffect, useState } from "react";
import type { Brief, BriefGroup, BriefItem } from "@/server/brief/compose";
import { CardExtras } from "./card-extras";
import { formatCoverDate, formatNextEdition, timeSince } from "./format";
import s from "./swipe-brief.module.css";

const WIDGET_SLOTS = ["Weather", "Prayer times", "Next match", "Countdowns"] as const;

/** Positions: 0 is the cover card, 1..n the Items, n + 1 "You're caught up". */
export function SwipeBrief({ brief }: { brief: Brief }) {
  const [pos, setPos] = useState(0);
  const now = useNow();
  const total = brief.items.length;
  const item = pos >= 1 && pos <= total ? brief.items[pos - 1]! : null;
  const next = () => setPos((p) => Math.min(p + 1, total + 1));
  const back = () => setPos((p) => Math.max(p - 1, 0));

  return (
    <div className={s.stage}>
      <ProgressBars brief={brief} pos={pos} />

      {pos === 0 && <Cover brief={brief} />}
      {item && <ItemCard item={item} brief={brief} position={pos} now={now} />}
      {pos > total && (
        <section className={s.done} aria-label="End of the Brief">
          <h2>You&apos;re caught up</h2>
          <p>{formatNextEdition(brief)}</p>
          <button type="button" className={s.startOver} onClick={() => setPos(0)}>
            Start over
          </button>
        </section>
      )}

      {pos > 0 && (
        <button type="button" className={`${s.tap} ${s.tapBack}`} aria-label="Back" onClick={back} />
      )}
      {pos <= total && (
        <button type="button" className={`${s.tap} ${s.tapNext}`} aria-label="Next" onClick={next} />
      )}

      {item && <Dock />}
    </div>
  );
}

function ProgressBars({ brief, pos }: { brief: Brief; pos: number }) {
  // How many Items of each group are read up to and including the current one.
  const seen = new Set(brief.items.slice(0, Math.max(0, pos)).map((i) => i.id));
  return (
    <div className={s.bars}>
      {brief.groups.map((g) => {
        const done = g.item_ids.filter((id) => seen.has(id)).length;
        return (
          <div
            key={g.topic ?? "top"}
            className={s.bar}
            role="progressbar"
            aria-label={groupName(g, brief)}
            aria-valuemin={0}
            aria-valuemax={g.item_ids.length}
            aria-valuenow={done}
          >
            <span style={{ width: `${(100 * done) / g.item_ids.length}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function groupName(g: BriefGroup, brief: Brief): string {
  return g.kind === "top" ? "Top for you" : brief.topic_names[g.topic!] ?? g.topic!;
}

function Cover({ brief }: { brief: Brief }) {
  const edition = brief.edition!;
  return (
    <section className={s.cover} aria-label="Cover card">
      <p className={s.kicker}>Morning Brief</p>
      <h1>{formatCoverDate(brief.cover!.date)}</h1>
      <p className={s.editionLine}>
        {edition.kind === "morning" ? "Morning Edition" : "Evening Edition"} · {brief.items.length}{" "}
        {brief.items.length === 1 ? "Item" : "Items"}
      </p>
      <div className={s.widgets}>
        {WIDGET_SLOTS.map((slot) => (
          <div key={slot} role="group" aria-label={slot} className={s.widget}>
            <span>{slot}</span>
            <b aria-hidden>—</b>
          </div>
        ))}
      </div>
      <p className={s.hint}>Tap the right side to start</p>
    </section>
  );
}

function ItemCard({ item, brief, position, now }: { item: BriefItem; brief: Brief; position: number; now: number | null }) {
  const name = (id: string) => brief.topic_names[id] ?? id;
  return (
    <article className={s.card} aria-label={item.title}>
      <div className={s.hero}>
        {item.image && (
          // External, already link-checked images from the Edition; next/image would need every host allow-listed.
          <img key={item.id} src={item.image} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
        )}
      </div>
      <span className={s.chip} data-testid="chip">
        {name(item.topic)} · {position}/{brief.items.length}
      </span>
      <div className={s.body}>
        <div className={s.badges}>
          {item.top && <span className={`${s.badge} ${s.badgeTop}`}>Top for you</span>}
          {item.status === "new" && <span className={s.badge}>New</span>}
          {item.status === "updated" && <span className={s.badge}>Updated</span>}
        </div>
        <h2>{item.title}</h2>
        <p className={s.summary}>{item.summary}</p>
        <CardExtras extras={item.extras} />
        {item.tags.length > 0 && <p className={s.tags}>Also in {item.tags.map(name).join(", ")}</p>}
        <p className={s.sources}>
          {item.sources.map((src, i) => (
            <span key={src.url}>
              {i > 0 && " · "}
              <a href={src.url} target="_blank" rel="noopener noreferrer">
                {src.title}
              </a>
            </span>
          ))}
          {" · "}
          <time dateTime={item.time}>{now === null ? "" : timeSince(item.time, now)}</time>
        </p>
      </div>
    </article>
  );
}

function Dock() {
  return (
    <div className={s.dock} role="toolbar" aria-label="Reactions">
      <DockButton label="Hide" path="M6 6l12 12M18 6L6 18" />
      <DockButton label="Save" path="M7 4h10v16l-5-4-5 4z" />
      <DockButton label="Like" path="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      <DockButton label="Ask" path="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
    </div>
  );
}

function DockButton({ label, path }: { label: string; path: string }) {
  return (
    <button type="button" className={s.dockButton}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <small>{label}</small>
    </button>
  );
}

/** The current time, known only after the page has loaded (so server and browser render the same HTML). */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
