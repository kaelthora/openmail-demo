import Link from "next/link";

export default function Page() {
  return (
    <div
      className="flex h-screen max-h-screen w-full flex-col items-center justify-center overflow-hidden px-4 py-2 text-[var(--text-main)]"
      style={{ backgroundColor: "var(--bg-main)" }}
    >
      <main className="flex w-full min-h-0 max-h-full max-w-[720px] flex-col items-center justify-center">
        <div className="flex w-full min-h-0 max-h-full flex-col gap-[9px] overflow-hidden text-[clamp(10.5px,1.6vmin,13px)] leading-[1.2] text-[#b0a69f] sm:gap-2.5">
          {/* Hero */}
          <section className="shrink-0 text-center">
            <h1 className="text-[clamp(1.5rem,4.55vmin,1.8rem)] font-bold leading-[1.12] tracking-tight text-[#f0eae8]">
              OpenMail
            </h1>
            <div className="mt-0.5 space-y-0 leading-[1.18] text-[#c9bfb8]">
              <p>Your inbox is being manipulated.</p>
              <p>OpenMail sees it.</p>
              <p>Before you do.</p>
            </div>

            <Link
              href="/openmail"
              prefetch={false}
              className="mt-1.5 inline-block rounded-md border border-[#6a4444]/55 bg-[#6f4747] px-3.5 py-1.5 text-[12px] font-semibold leading-tight text-[#f6f0f0] no-underline transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#583535] hover:shadow-[0_0_16px_rgba(100,52,52,0.12)]"
            >
              Secure my inbox
            </Link>

            <p className="mt-1 text-[10px] leading-[1.15] text-[#a89e98]">
              No tracking. No data. Ever.
            </p>
          </section>

          {/* Core */}
          <section className="shrink-0 border-t border-[#6a4444]/28 pt-1.5 text-left leading-[1.2]">
            <p className="text-[clamp(13.8px,3vmin,16px)] font-semibold leading-[1.16] text-[#ebe4e1]">
              You don&apos;t read emails wrong.
            </p>
            <p className="mt-0.5 text-[clamp(13.8px,3vmin,16px)] font-semibold leading-[1.16] text-[#ddd5d0]">
              You get manipulated.
            </p>

            <div className="mt-1 space-y-0 leading-[1.2] text-[#c9beb9]">
              <p className="text-[#d4ccc8]">OpenMail detects it instantly.</p>
              <p>But it never decides for you.</p>
              <p>No tracking.</p>
              <p>No data collection.</p>
              <p>No hidden actions.</p>
              <p className="text-[#c4bab5]">Not even us.</p>
            </div>
            <p className="mt-1 text-[10px] leading-[1.15] text-[#7d726e]">
              Built for protection. Designed for trust.
            </p>
          </section>

          {/* Scam mechanics */}
          <section className="shrink-0 border-t border-[#6a4444]/28 pt-1.5 text-center leading-[1.2]">
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-0 text-[12px] font-semibold text-[#b5aaa5]">
              <span>Urgency</span>
              <span>Pressure</span>
              <span>Authority</span>
            </div>
            <p className="mt-0.5 text-[12px] text-[#c9bfb8]">That&apos;s how scams work.</p>
            <p className="mt-0.5 text-[13px] font-semibold leading-[1.2] text-[#e2d9d5]">
              OpenMail sees what others miss.
            </p>
          </section>

          {/* Investor */}
          <section className="shrink-0 border-t border-[#6a4444]/28 pt-1.5 text-left leading-[1.2]">
            <p className="text-[11.5px] font-medium text-[#b8aca8]">
              OpenMail doesn&apos;t filter emails.
            </p>
            <p className="mt-1 text-[clamp(13px,2.85vmin,15.5px)] font-semibold leading-[1.2] text-[#e6deda]">
              It reads intent.
            </p>
            <ul className="mt-0.5 space-y-0 font-mono text-[11px] leading-[1.22] text-[#9a8f8a]">
              <li>→ Intent analysis</li>
              <li>→ Behavioral patterns</li>
              <li>→ Domain validation</li>
              <li>→ Risk scoring</li>
              <li>→ Autonomous protection</li>
            </ul>
            <p className="mt-0.5 text-[11.5px] font-medium text-[#a89e98]">
              No rules. Just decisions.
            </p>
          </section>

          {/* Final */}
          <section className="shrink-0 border-t border-[#6a4444]/28 pt-1.5 text-center leading-[1.15]">
            <p className="text-[clamp(13.8px,3vmin,16px)] font-medium text-[#ebe4e1]">
              You don&apos;t need a better inbox.
            </p>
            <p className="mt-0.5 text-[clamp(1.15rem,3.2vmin,1.32rem)] font-bold leading-[1.12] text-[#f4efed]">
              You need control.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
