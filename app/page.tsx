"use client";

import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <div className="h-[600px] w-[600px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="home-hero relative z-10 px-6 box-border">
        <h1 className="title">OpenMail</h1>
        <p className="subtitle">Your inbox answers before you do.</p>

        <div className="preview-badge" role="status">
          <p>DEMO EXPERIENCE — This is a live preview of OpenMail in development.</p>
          <p>GMAIL INTEGRATION — Limited to test environment</p>
          <p>Some features are simulated or in progress.</p>
          <div className="home-hero-preview-spacer" aria-hidden />
          <p>You&apos;re exploring the future of email interaction.</p>
          <p>Core AI is active. Full system coming soon.</p>
        </div>

        <button
          type="button"
          className="cta-enter rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 px-10 py-4 text-lg font-medium text-white shadow-[0_0_40px_rgba(59,130,246,0.4)] transition-transform duration-200 hover:scale-105"
          onClick={() => router.push("/openmail")}
        >
          Enter your inbox
        </button>

        <div className="feature-list">
          <p>→ Reads your emails</p>
          <p>→ Understands intent</p>
          <p>→ Writes replies instantly</p>
        </div>
      </div>
    </div>
  );
}
