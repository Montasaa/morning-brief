import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { getAppContext } from "@/server/app";
import { configFromEnv } from "@/server/config";
import { currentReader } from "@/server/readers/page-session";
import { getProfile } from "@/server/readers/profile";
import { LANG_COOKIE, dirOf, languageFrom } from "./_components/i18n";
import { LanguageProvider } from "./_components/language";
import { TabBar } from "./_components/tab-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Morning Brief",
  description: "Your personal Morning Brief.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The Reader's language (ticket 04), so the first paint is already in it and laid out in its direction:
  // from their Interest Profile once they have chosen one (ticket 07), else this device's cookie.
  const reader = await currentReader();
  const saved = reader ? getProfile(getAppContext(), reader).language : null;
  const lang = saved ?? languageFrom((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <body>
        <LanguageProvider initial={lang} cookiePath={configFromEnv().basePath} saveToProfile={reader !== null}>
          {children}
          <TabBar />
        </LanguageProvider>
      </body>
    </html>
  );
}
