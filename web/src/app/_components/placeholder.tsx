// A plain scrolling screen with a heading, for tabs that are not built yet.
// Title and text are usually <T en ar /> so they follow the Reader's language.
import type { ReactNode } from "react";
import s from "./placeholder.module.css";

export function Placeholder({ title, children, after }: { title: ReactNode; children: ReactNode; after?: ReactNode }) {
  return (
    <main className={s.screen}>
      <h1>{title}</h1>
      <p>{children}</p>
      {after}
    </main>
  );
}
