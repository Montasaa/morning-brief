import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { configFromEnv } from "@/server/config";
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
  // The Reader's language (ticket 04), so the first paint is already in it and laid out in its direction.
  const lang = languageFrom((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <body>
        <LanguageProvider initial={lang} cookiePath={configFromEnv().basePath}>
          {children}
          <TabBar />
        </LanguageProvider>
      </body>
    </html>
  );
}
