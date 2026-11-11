import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Player } from "@/components/Player";
import { KeyBanner } from "@/components/KeyBanner";
import { Welcome } from "@/components/Welcome";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Spotifind — discover music you'll love", template: "%s · Spotifind" },
  description: "Spotify is where you listen. Spotifind is where you discover music you'll love.",
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-dvh overflow-hidden">
        <div className="flex h-dvh flex-col">
          <div className="flex min-h-0 flex-1">
            <Suspense fallback={<div className="hidden w-[232px] border-r border-line bg-void md:block" />}>
              <Sidebar />
            </Suspense>
            <main id="main" className="scroll-area relative min-w-0 flex-1 overflow-y-auto bg-base">
              <Suspense fallback={<div className="h-[72px]" />}>
                <TopBar />
              </Suspense>
              <KeyBanner />
              <div className="animate-fade-in pb-12">{children}</div>
            </main>
          </div>
          <Player />
          <Suspense fallback={null}>
            <MobileNav />
          </Suspense>
        </div>
        <Welcome />
      </body>
    </html>
  );
}
