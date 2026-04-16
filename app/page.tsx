import Link from "next/link";

export default function Page() {
  return (
    <div
      className="flex h-screen max-h-screen w-full flex-col items-center justify-center overflow-hidden px-4 py-3 text-[var(--text-main)]"
      style={{ backgroundColor: "var(--bg-main)" }}
    >
      <main className="flex w-full min-h-0 max-h-full max-w-[720px] flex-col items-center justify-center">
        <div className="flex w-full min-h-0 max-h-full flex-col gap-[11px] overflow-hidden text-[clamp(9.5px,1.45vmin,11.75px)] leading-[1.2] text-[#a49794] sm:gap-3">
          {/* Hero */}
          <section className="shrink-0 text-center">
            <h1 className="text-[clamp(1.25rem,3.8vmin,1.5rem)] font-semibold leading-[1.15] tracking-tight">
              OpenMail
            </h1>
            <div className="mt-0.5 space-y-0 leading-[1.18] text-[#b5aba8]">
              <p>Your inbox is being manipulated.</p>
              <p>OpenMail sees it.</p>
              <p>Before you do.</p>
            </div>

            <Link
              href="/openmail"
              prefetch={false}
              className="mt-1.5 inline-block rounded-md border border-[#6a4444]/55 bg-[#6f4747] px-3 py-1 text-[11px] font-medium leading-tight text-[#f2e7e7] no-underline transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#583535] hover:shadow-[0_0_16px_rgba(100,52,52,0.1)]"
            >
              Secure my inbox
            </Link>

            <p className="mt-1 text-[9px] leading-[1.15] text-[#9a908d]">
              No tracking. No data. Ever.
            </p>
          </section>

          {/* Core */}
          <section className="shrink-0 border-t border-[#6a4444]/25 pt-2 text-left leading-[1.2]">
            <p className="text-[clamp(12px,2.6vmin,14px)] font-medium leading-[1.18] text-[var(--text-main)]">
              You don&apos;t read emails wrong.
            </p>
            <p className="mt-px text-[clamp(12px,2.6vmin,14px)] leading-[1.18] text-[#b5aba8]">
              You get manipulated.
            </p>

            <div className="mt-1 space-y-0 leading-[1.2]">
              <p className="text-[#c9beb9]">OpenMail detects it instantly.</p>
              <p>But it never decides for you.</p>
              <p>No tracking.</p>
              <p>No data collection.</p>
              <p>No hidden actions.</p>
              <p className="text-[#b5aba8]">Not even us.</p>
            </div>
            <p className="mt-1 text-[9px] leading-[1.15] text-[#6a5e5b]">
              Built for protection. Designed for trust.
            </p>
          </section>

          {/* Scam mechanics */}
          <section className="shrink-0 border-t border-[#6a4444]/25 pt-2 text-center leading-[1.2]">
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-0 text-[11px] font-medium text-[#a49794]">
              <span>Urgency</span>
              <span>Pressure</span>
              <span>Authority</span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#b5aba8]">That&apos;s how scams work.</p>
            <p className="mt-0.5 text-[11.5px] font-semibold leading-[1.2] text-[#d4ccc8]">
              OpenMail sees what others miss.
            </p>
          </section>

          {/* Investor */}
          <section className="shrink-0 border-t border-[#6a4444]/25 pt-2 text-left leading-[1.2] opacity-[0.88]">
            <p className="text-[10.5px] text-[#a89e9a]">
              OpenMail doesn&apos;t filter emails.
              <br />
              It reads intent.
            </p>
            <ul className="mt-0.5 space-y-0 font-mono text-[10px] leading-[1.22] text-[#8a7e7a]">
              <li>→ Intent analysis</li>
              <li>→ Behavioral patterns</li>
              <li>→ Domain validation</li>
              <li>→ Risk scoring</li>
              <li>→ Autonomous protection</li>
            </ul>
            <p className="mt-0.5 text-[10.5px] text-[#948a86]">
              No rules. Just decisions.
            </p>
          </section>

          {/* Final */}
          <section className="shrink-0 border-t border-[#6a4444]/25 pt-2 text-center leading-[1.18]">
            <p className="text-[clamp(12px,2.6vmin,14px)] text-[var(--text-main)]">
              You don&apos;t need a better inbox.
            </p>
            <p className="mt-0.5 text-[clamp(1rem,2.8vmin,1.15rem)] font-semibold leading-[1.15] text-[#e8e0de]">
              You need control.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
