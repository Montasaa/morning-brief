"use client";
// The Brief in the Reader's Layout for this screen (rework ticket 09): Swipe,
// Front Page or List, by the Reader's pick for the screen class, else its
// default (screen-class.ts). It follows the screen: a tablet turned on its
// side switches from Swipe to Front Page until the Reader picks one for
// tablets. Reactions are kept here, so switching Layout keeps them.
//
// The screen is only known in the browser, so the server sends the dark
// canvas and the Layout appears once the page is running.
import type { Brief } from "@/server/brief/compose";
import { useDisplay } from "./display";
import { FrontPage } from "./front-page";
import { useReactions } from "./reactions";
import { layoutFor, useScreen } from "./screen-class";
import { SwipeBrief } from "./swipe-brief";

export function BriefLayouts({ brief, basePath }: { brief: Brief; basePath: string }) {
  const reactions = useReactions(brief, basePath);
  const { display } = useDisplay();
  const screen = useScreen();
  if (!screen) return <div className="brief-canvas" />;
  const layout = layoutFor(display.layouts, screen);
  return layout === "swipe" ? (
    <SwipeBrief reactions={reactions} basePath={basePath} />
  ) : (
    <FrontPage layout={layout} screen={screen} reactions={reactions} basePath={basePath} />
  );
}
