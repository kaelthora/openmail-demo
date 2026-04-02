import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "imapflow",
    "mailparser",
    "nodemailer",
  ],
};

export default nextConfig;
