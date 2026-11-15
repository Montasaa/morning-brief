import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { getAppContext } from "@/server/app";
import { configFromEnv } from "@/server/config";
import { currentReader } from "@/server/readers/page-session";
import { DEFAULT_DISPLAY, type Display } from "@/server/display/shape";
import { getProfile } from "@/server/readers/profile";
import { DisplayProvider } from "./_components/display";
import { displayAttributes } from "./_components/display-attributes";
import { LANG_COOKIE, dirOf, languageFrom } from "./_components/i18n";
import { LanguageProvider } from "./_components/language";
import { ServiceWorkerRegistration } from "./_components/service-worker";
import { TabBar } from "./_components/tab-bar";
import { inter, plexArabic } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Morning Brief",
  description: "Your personal Morning Brief.",
  // Opens like an app from the iPhone home screen (ticket 18; the manifest is app/manifest.ts).
  appleWebApp: { capable: true, title: "Brief", statusBarStyle: "default" },
};

/** The browser's bar colour follows the chrome's background for the Reader's theme. */
export async function generateViewport(): Promise<Viewport> {
  const { theme } = await readerDisplay();
  const bars = { light: "#ffffff", dark: "#000000" };
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor:
      theme === "auto"
        ? [
            { media: "(prefers-color-scheme: light)", color: bars.light },
            { media: "(prefers-color-scheme: dark)", color: bars.dark },
          ]
        : bars[theme],
  };
}

/** The signed-in Reader's Display (rework ticket 07), or the defaults when signed out. */
async function readerDisplay(): Promise<Display> {
  const reader = await currentReader();
  return reader ? getProfile(getAppContext(), reader).display : DEFAULT_DISPLAY;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Rendered on the document so the first paint is already right, with no flash:
  // - the Reader's language (ticket 04) and its direction: from their Interest Profile once they
  //   have chosen one (ticket 07), else this device's cookie;
  // - their Display (rework ticket 07): theme, accent, text size and density as data attributes,
  //   which globals.css styles from. Auto follows the device's colour-scheme preference in CSS.
  const reader = await currentReader();
  const profile = reader ? getProfile(getAppContext(), reader) : null;
  const lang = profile?.language ?? languageFrom((await cookies()).get(LANG_COOKIE)?.value);
  const display = profile?.display ?? DEFAULT_DISPLAY;
  const { basePath } = configFromEnv();
  return (
    <html lang={lang} dir={dirOf(lang)} className={`${inter.variable} ${plexArabic.variable}`} {...displayAttributes(display)}>
      <body>
        <LanguageProvider initial={lang} cookiePath={basePath} saveToProfile={reader !== null}>
          <DisplayProvider initial={display} basePath={basePath} signedIn={reader !== null}>
            {children}
            <TabBar />
            <ServiceWorkerRegistration basePath={basePath} />
          </DisplayProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
