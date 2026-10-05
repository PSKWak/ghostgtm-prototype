import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/ghost/nav";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ResetButton } from "./reset-button";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "GhostGTM Prototype",
  description: "Post-call follow-up from customer context to executed action to validated learning.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen antialiased">
        <TooltipProvider>
          <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
              <div className="flex items-center gap-5">
                <Link href="/workspace" className="font-semibold tracking-tight">Ghost<span className="text-muted-foreground">GTM</span></Link>
                <Nav />
              </div>
              <ResetButton />
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
