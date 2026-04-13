"use client";

import Link from "next/link";

const featureLines = [
  "Spots scams in seconds",
  "Flags manipulation fast",
  "Suggests safer next steps",
  "Blocks reckless replies",
  "Pauses you before Send",
];

export default function Page() {
  return (
    <div className="openmail-landing flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden text-white subpixel-antialiased antialiased">
      {/* Base + premium halo stack */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[#040508]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_130%_90%_at_50%_-15%,rgba(59,130,246,0.16),transparent_58%),radial-gradient(ellipse_70%_55%_at_100%_20%,rgba(139,92,246,0.1),transparent_52%),radial-gradient(ellipse_55%_45%_at_0%_80%,rgba(59,130,246,0.06),transparent_50%),linear-gradient(180deg,#05060a_0%,#080a12_42%,#020308_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_115%,rgba(16,185,129,0.05),transparent_48%)]"
        aria-hidden
      />
      {/* Radial spotlight behind hero card */}
      <div
        className="pointer-events-none fixed left-1/2 top-[min(30%,220px)] z-[1] h-[min(52vh,380px)] w-[min(92vw,480px)] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.11),rgba(139,92,246,0.06)_45%,transparent_68%)] blur-[52px]"
        aria-hidden
      />
      <div
        className="openmail-landing-card-halo pointer-events-none fixed left-1/2 top-[min(38%,280px)] z-[1] h-[min(70vmin,440px)] w-[min(92vmin,520px)] -translate-x-1/2 rounded-full blur-[40px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed left-1/2 top-[min(38%,280px)] z-[1] h-[min(58vmin,360px)] w-[min(72vmin,420px)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.08)_0%,transparent_68%)] blur-2xl"
        aria-hidden
      />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-3 sm:px-5 sm:py-4">
        <div className="openmail-landing-stack flex w-full max-w-[580px] flex-col items-center translate-y-[min(1.5vh,12px)] [@media(max-height:760px)]:translate-y-[min(0.5vh,6px)]">
          {/* 1 — Hero (glass card only) */}
          <div className="relative z-[2] w-full">
            <div className="openmail-landing-glass openmail-landing-glass--hero w-full max-w-[560px] rounded-[20px] px-5 py-5 sm:rounded-[22px] sm:px-8 sm:py-6 max-[560px]:rounded-[18px]">
              <div className="openmail-landing-fade-stagger relative z-[1] flex flex-col items-center gap-5 text-center [@media(max-height:760px)]:gap-4">
                <header className="flex flex-col gap-2 sm:gap-2.5">
                  <h1 className="text-[clamp(1.55rem,3.8vw,2.35rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-white drop-shadow-[0_0_24px_rgba(59,130,246,0.2)]">
                    OpenMail
                  </h1>
                  <p className="mx-auto max-w-[26rem] text-pretty text-[clamp(0.8rem,2.1vw,1.05rem)] leading-[1.45]">
                    <span className="text-white/72">
                      Ethical inbox: experts plus live AI.
                    </span>
                    <br />
                    <span className="text-white/72">
                      We don&apos;t just read your mail.
                    </span>
                    <br />
                    <span className="font-medium text-white/92">
                      We catch intent, bias, and pressure.
                    </span>
                  </p>
                </header>

                <div className="relative inline-flex shrink-0">
                  <div
                    className="openmail-landing-cta-glow pointer-events-none absolute -inset-7 rounded-full blur-3xl"
                    aria-hidden
                  />
                  <Link
                    href="/openmail"
                    prefetch={false}
                    className="openmail-landing-cta relative inline-flex items-center justify-center rounded-[11px] px-6 py-3 text-[12.5px] font-semibold tracking-[0.06em] text-white no-underline sm:px-8 sm:py-3.5 sm:text-[13px] motion-reduce:transition-none"
                  >
                    Enter protected inbox
                  </Link>
                </div>

                <ul className="space-y-1.5 text-[11px] leading-[1.55] tracking-[0.04em] text-white/58 sm:text-[12px]">
                  <li>
                    AI assists. Humans stay in charge.
                    <br />
                    Ethics ships with every build.
                  </li>
                </ul>

                <p className="max-w-[24rem] text-pretty text-[11.5px] leading-[1.5] text-white/72 sm:text-[12.5px]">
                  Not just software—a live stance.
                  <br />
                  Veterans meet tireless machine focus.
                  <br />
                  They catch what hurry hides.
                  <br />
                  Urgency fades. Deception stalls early.
                </p>
              </div>
            </div>
          </div>

          {/* 2 — Email philosophy (no card) */}
          <section
            className="w-full max-w-[25rem] text-center sm:max-w-[26rem]"
            aria-labelledby="landing-email-built"
          >
            <h2 id="landing-email-built" className="sr-only">
              How email works today
            </h2>
            <div className="space-y-2 text-[11px] leading-[1.62] sm:text-[12px] sm:leading-[1.68]">
              <p className="text-white/78">Zero tracking. No resale. Ever.</p>
              <p className="text-white/82">Your mail never trains ad graphs.</p>
              <p className="text-white/88">Your choices stay fully yours.</p>
              <p className="font-medium text-white/95">We protect inbox peace—not profiles.</p>
              <p className="pt-1 text-white/76">No silent audience deals here.</p>
              <p className="text-[10.5px] text-white/58 sm:text-[11.5px]">
                Ethics over engagement tricks.
              </p>
            </div>
          </section>

          {/* 3 — Product (no card) */}
          <section
            className="flex w-full max-w-[23rem] flex-col items-center gap-3 text-center sm:max-w-[24rem] sm:gap-3.5"
            aria-labelledby="landing-product"
          >
            <h2 id="landing-product" className="sr-only">
              What OpenMail is
            </h2>
            <div className="space-y-1.5">
              <p className="text-[12.5px] font-medium leading-snug text-white/90 sm:text-[13px]">
                Humans pattern-match under stress.
                <br />
                Machines read every line cold.
              </p>
              <p className="text-[11.5px] leading-[1.55] text-sky-200/88 sm:text-[12.5px]">
                Two lenses. One honest read.
                <br />
                Stakes first—then full-text AI.
                <br />
                That&apos;s how mistakes die here.
              </p>
            </div>
            <ul className="w-full space-y-1.5 text-[11.5px] leading-[1.5] text-white/72 sm:text-[12px]">
              {featureLines.map((line) => (
                <li key={line} className="flex justify-center gap-2">
                  <span className="text-white/32" aria-hidden>
                    •
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 4 — Demo (anchored glass) */}
          <div className="relative z-[2] w-full max-w-[460px]">
            <div
              className="mb-2 h-px w-full max-w-[10rem] bg-gradient-to-r from-transparent via-white/14 to-transparent sm:mb-2.5 sm:max-w-[12rem]"
              aria-hidden
            />
            <aside
              className="openmail-landing-glass openmail-landing-glass--demo rounded-[14px] px-4 py-3 text-center sm:rounded-[15px] sm:px-5 sm:py-3.5"
              aria-label="Demo preview"
            >
              <div className="relative z-[1] flex flex-col items-center gap-2 sm:gap-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/88 sm:text-[11px]">
                  🧪 DEMO PREVIEW
                </p>
                <p className="max-w-[22rem] text-[10.5px] leading-[1.55] text-white/65 sm:text-[11.5px]">
                  Live preview—Gmail-tuned, still evolving.
                  <br />
                  Some flows stay demo-only today.
                </p>
              </div>
            </aside>
          </div>

          {/* 5 — Closing */}
          <footer className="flex w-full max-w-[26rem] flex-col items-center gap-2.5 pb-1 pt-1 text-center sm:gap-3">
            <p className="max-w-[24rem] text-pretty text-[clamp(0.85rem,2.2vw,1.05rem)] font-semibold leading-[1.48] tracking-[-0.018em] text-white">
              You don&apos;t need a shinier inbox.
              <br />
              <span className="font-semibold text-sky-100/96 drop-shadow-[0_0_18px_rgba(56,189,248,0.18)]">
                You need sense before you hit Send.
              </span>
            </p>
            <p className="max-w-[22rem] text-pretty text-[10px] leading-[1.5] tracking-[0.02em] text-white/48 sm:text-[11.5px]">
              One calm beat beats regret.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
