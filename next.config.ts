import type { NextConfig } from "next";

// DEMO MODE: Prisma disabled for Vercel deployment — do not externalize @prisma/client
const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
};

export default nextConfig;
