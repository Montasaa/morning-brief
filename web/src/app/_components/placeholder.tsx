// A plain scrolling screen with a heading, for tabs that are not built yet.
import type { ReactNode } from "react";
import s from "./placeholder.module.css";

export function Placeholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={s.screen}>
      <h1>{title}</h1>
      <p>{children}</p>
    </main>
  );
}
