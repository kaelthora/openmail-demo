/**
 * Demo-only URL tiering for inbox link interception (no real navigation until user confirms sandbox).
 */

export type DemoLinkTier = "safe" | "suspicious" | "blocked";

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    try {
      return new URL(decodeURIComponent(url)).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}

export function classifyDemoLinkUrl(url: string): DemoLinkTier {
  const host = hostOf(url);
  if (!host) return "blocked";

  if (
    host.includes("malicious-demo") ||
    host.endsWith(".bad") ||
    /(^|\.)evil-link\.demo$/.test(host) ||
    host === "wallet-drain.xyz" ||
    host.endsWith(".wallet-drain.xyz") ||
    host.includes("eth-rescue") ||
    host.includes("crypto-drainer")
  ) {
    return "blocked";
  }

  if (
    host.includes("accounts-google") ||
    host.includes("google-security") ||
    host.includes("g00gle") ||
    host.includes("amaz0n") ||
    /amazon-.*\.(xyz|tk|ml|ga|gq)$/i.test(host) ||
    host.includes("amazon-delivery-fail") ||
    host.includes("prime-shipping-alert") ||
    host.includes("secure-amazon-billing") ||
    /\.(xyz|tk|ml|ga|gq)$/i.test(host)
  ) {
    return "suspicious";
  }

  if (
    host.endsWith("northwind.design") ||
    host === "cal.example.com" ||
    host.endsWith(".northwind.design") ||
    host === "example.com" ||
    host === "www.example.com"
  ) {
    return "safe";
  }

  return "suspicious";
}
