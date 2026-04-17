import type { Metadata } from "next";
import Script from "next/script";
import { getOpenmailThemeBootScript } from "@/lib/openmailThemeBootScript";
import { AppModeProvider } from "./AppModeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenMail",
  description: "AI-native mail experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="relative min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <Script
          id="openmail-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: getOpenmailThemeBootScript() }}
        />
        <AppModeProvider>{children}</AppModeProvider>
      </body>
    </html>
  );
}
