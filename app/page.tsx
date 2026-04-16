import Link from "next/link";
import { HowItThinksExpandable } from "@/components/landing/HowItThinksExpandable";

export default function Page() {
  return (
    <div
      className="h-screen w-full overflow-y-auto overflow-x-hidden text-[var(--text-main)]"
      style={{ backgroundColor: "var(--bg-main)" }}
    >
      {/* HERO */}
      <main className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-6 py-8">
        <section className="text-center">
          <h1 className="text-4xl font-semibold md:text-6xl">OpenMail</h1>
          <p className="mt-2 text-base text-[#b5aba8] md:text-lg">
            Your inbox is being manipulated. OpenMail stops it.
          </p>

          <Link
            href="/openmail"
            prefetch={false}
            className="mt-4 inline-block rounded-lg border border-[#6a4444]/55 bg-[#6f4747] px-5 py-2 text-sm font-medium text-[#f2e7e7] no-underline transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#583535] hover:shadow-[0_0_28px_rgba(100,52,52,0.12)]"
          >
            Try OpenMail (see how it thinks)
          </Link>

          <p className="mt-1.5 text-[10px] leading-snug text-[#9a908d]">
            Gmail supported (App password required)
          </p>

          <p className="mt-2 text-xs text-[#9a908d]">No tracking. No data. Ever.</p>
        </section>

        {/* THREAT */}
        <section className="mt-4 border-t border-[#6a4444]/35 pt-4 text-left">
          <p className="text-xl font-medium md:text-2xl">You don&apos;t read emails wrong.</p>
          <p className="mt-1 text-xl text-[#b5aba8] md:text-2xl">You get manipulated.</p>

          <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#a49794] md:text-base">
            <p className="text-[var(--text-main)]">OpenMail detects it instantly.</p>
            <p>But it never decides for you.</p>
            <p>No tracking. No data collection. No hidden actions.</p>
            <p className="font-medium text-[#c4b8b4]">You stay in control. Always.</p>
          </div>
          <p className="mt-4 text-[11px] leading-snug text-[#6a5e5b]">
            Built for protection. Designed for trust.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2 text-sm text-[#a49794] md:text-base">
            <p>Urgency.</p>
            <p>Pressure.</p>
            <p>Authority.</p>
          </div>

          <p className="mt-2 text-sm md:text-base">That&apos;s how scams work.</p>
        </section>

        {/* IMPACT */}
        <section className="mt-4 border-t border-[#6a4444]/35 pt-4 text-center">
          <p className="text-2xl font-semibold md:text-3xl">OpenMail sees it first.</p>
        </section>

        {/* AI + HUMAN */}
        <section className="mt-4 border-t border-[#6a4444]/35 pt-4 text-center">
          <div className="grid grid-cols-3 gap-2 text-sm md:text-base">
            <p>Human instinct.</p>
            <p className="text-[#a49794]">AI precision.</p>
            <p>Working together.</p>
          </div>
        </section>

        {/* FUNCTION */}
        <section className="mt-4 border-t border-[#6a4444]/35 pt-4 text-center text-sm text-[#a49794] md:text-base">
          <div className="grid grid-cols-3 gap-2">
            <p>Detects scams.</p>
            <p>Flags manipulation.</p>
            <p>Stops bad decisions.</p>
          </div>
        </section>

        {/* HOW IT THINKS — investor bait, minimal */}
        <section className="mt-4 border-t border-[#6a4444]/35 pt-4 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a6e6b]">
            How it thinks
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#b5aba8] md:text-base">
            OpenMail doesn&apos;t filter emails.
            <br />
            It understands them.
          </p>
          <ul className="mt-4 space-y-2 font-mono text-[12px] leading-relaxed text-[#8a7e7a] md:text-[13px]">
            <li>→ Intent analysis</li>
            <li>→ Behavioral patterns</li>
            <li>→ Domain validation</li>
            <li>→ Risk scoring engine</li>
            <li>→ Autonomous protection layer</li>
          </ul>
          <p className="mt-4 text-sm text-[#a49794] md:text-base">
            No rules.
            <br />
            Just decisions.
          </p>
          <HowItThinksExpandable />
        </section>

        {/* FINAL */}
        <section className="mt-4 border-t border-[#6a4444]/35 pt-4 pb-8 text-center">
          <p className="text-xl md:text-2xl">You don&apos;t need a better inbox.</p>
          <p className="mt-1 text-2xl font-semibold text-[#e8e0de] md:text-3xl">You need control.</p>
          <p className="mt-4 text-xl md:text-2xl">
            Most scams don&apos;t look like scams.
            <br />
            That&apos;s why they work.
          </p>
        </section>
      </main>
    </div>
  );
}
