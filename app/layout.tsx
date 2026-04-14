import type { Metadata } from "next";
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
    <html lang="en">
      <body className="relative bg-gradient-to-br from-[#020617] via-[#020617] to-[#030b1a] text-white">
        {children}
      </body>
    </html>
  );
}
