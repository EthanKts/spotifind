import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Player } from "@/components/Player";
import { KeyBanner } from "@/components/KeyBanner";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Spotifind — discover music you'll love", template: "%s · Spotifind" },
  description: "Spotify is where you listen. Spotifind is where you discover music you'll love.",
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full`}>
      <body className="h-dvh overflow-hidden">
        <div className="flex h-dvh flex-col md:gap-2 md:p-2">
          <div className="flex min-h-0 flex-1 gap-2">
            <Suspense fallback={<div className="hidden w-[260px] rounded-lg bg-base md:block lg:w-[300px]" />}>
              <Sidebar />
            </Suspense>
            <main id="main" className="scroll-area relative min-w-0 flex-1 overflow-y-auto bg-base md:rounded-lg">
              <Suspense fallback={<div className="h-[72px]" />}>
                <TopBar />
              </Suspense>
              <KeyBanner />
              <div className="animate-fade-in pb-8">{children}</div>
            </main>
          </div>
          <Player />
          <Suspense fallback={null}>
            <MobileNav />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
