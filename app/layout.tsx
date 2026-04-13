import type { Metadata } from "next";
import "./globals.css";
import { OPENMAIL_THEME_DEFAULT } from "@/lib/openmailTheme";

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
    <html
      lang="en"
      suppressHydrationWarning
      data-openmail-theme={OPENMAIL_THEME_DEFAULT}
    >
      <body className="relative">
        <div
          className="fixed inset-0 z-0 pointer-events-none opacity-20"
          style={{ backgroundImage: "url('/openmail-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}
        ></div>
        <div className="fixed inset-0 z-0 bg-black/40 pointer-events-none"></div>

        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
