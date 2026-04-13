import type { NextConfig } from "next";

// DEMO MODE: Prisma disabled for Vercel deployment — do not externalize @prisma/client
const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
  /** Intentionally no `redirects` from `/` — landing stays at `/`, app at `/openmail`. */
};

export default nextConfig;
