"use client";
// The Brief in the Reader's Layout for this screen (rework ticket 09): Swipe,
// Front Page or List, by the Reader's pick for the screen class, else its
// default (screen-class.ts). It follows the screen: a tablet turned on its
// side switches from Swipe to Front Page until the Reader picks one for
// tablets. Reactions are kept here, so switching Layout keeps them.
//
// Arranging (rework ticket 11): the server sends the Brief arranged by the
// Reader's Display, and it is arranged again here from the Display on screen
// (arrangeBrief, arrangeWidgets), so a pin, a new order, a collapse or a Widget
// change shows at once, before it is saved, and a change made on another device
// shows when the page comes back into view. Edit mode (the Edit button, or `e`)
// is kept here too, so it survives a Layout switch.
//
// The screen is only known in the browser, so the server sends the dark
// canvas and the Layout appears once the page is running.
import { useEffect, useMemo, useState } from "react";
import { arrangeBrief, arrangeWidgets } from "@/server/brief/arrange";
import type { Brief } from "@/server/brief/compose";
import { useDisplay } from "./display";
import { FrontPage } from "./front-page";
import { useReactions } from "./reactions";
import { layoutFor, useScreen } from "./screen-class";
import { isShortcut } from "./shortcuts";
import { SwipeBrief } from "./swipe-brief";

/** Edit mode on the Brief: whether it is on, and how to turn it on or off. */
export interface EditMode {
  editing: boolean;
  setEditing(on: boolean): void;
}

export function BriefLayouts({ brief: sent, basePath }: { brief: Brief; basePath: string }) {
  const { display } = useDisplay();
  const { pinned, topic_order, collapsed, widgets } = display;
  const brief = useMemo(() => {
    const arranged = arrangeBrief(sent, { pinned, topic_order, collapsed });
    const cover = arranged.cover && { ...arranged.cover, ...arrangeWidgets([...arranged.cover.widgets, ...arranged.cover.more_widgets], widgets) };
    return { ...arranged, cover };
  }, [sent, pinned, topic_order, collapsed, widgets]);
  const reactions = useReactions(brief, basePath);
  const screen = useScreen();

  const [editing, setEditing] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "e" || e.shiftKey || !isShortcut(e)) return;
      e.preventDefault();
      setEditing((on) => !on);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const edit: EditMode = { editing, setEditing };

  if (!screen) return <div className="brief-canvas" />;
  const layout = layoutFor(display.layouts, screen);
  return layout === "swipe" ? (
    <SwipeBrief reactions={reactions} basePath={basePath} edit={edit} />
  ) : (
    <FrontPage layout={layout} screen={screen} reactions={reactions} basePath={basePath} edit={edit} />
  );
}
