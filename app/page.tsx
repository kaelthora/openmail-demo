import Link from "next/link";

export default function Page() {
  return (
    <div
      className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden text-[var(--text-main)]"
      style={{ backgroundColor: "var(--bg-main)" }}
    >
      <main className="mx-auto flex h-full w-full max-w-[720px] flex-col justify-center gap-0 px-5 py-2 text-[13px] leading-[1.28] text-[#a49794] sm:px-6 sm:text-[13.5px] sm:leading-[1.3] [@media(max-height:760px)]:py-1 [@media(max-height:760px)]:text-[11.5px] [@media(max-height:760px)]:leading-[1.22] [@media(max-height:680px)]:text-[10.5px] [@media(max-height:680px)]:leading-[1.2]">
        {/* HERO — compact */}
        <section className="text-center">
          <h1 className="text-[1.65rem] font-semibold tracking-tight sm:text-[1.85rem] md:text-[2rem]">
            OpenMail
          </h1>
          <div className="mt-1 space-y-0 text-[#b5aba8]">
            <p>Your inbox is being manipulated.</p>
            <p>OpenMail sees it.</p>
            <p>Before you do.</p>
          </div>

          <Link
            href="/openmail"
            prefetch={false}
            className="mt-2.5 inline-block rounded-lg border border-[#6a4444]/55 bg-[#6f4747] px-4 py-1.5 text-[12px] font-medium text-[#f2e7e7] no-underline transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#583535] hover:shadow-[0_0_20px_rgba(100,52,52,0.1)] sm:mt-2 sm:px-5 sm:py-2 sm:text-sm"
          >
            Secure my inbox
          </Link>

          <p className="mt-1.5 text-[10px] leading-tight text-[#9a908d]">
            No tracking. No data. Ever.
          </p>
        </section>

        {/* CORE MESSAGE */}
        <section className="mt-2.5 border-t border-[#6a4444]/30 pt-2.5 text-left">
          <p className="text-[15px] font-medium leading-[1.22] text-[var(--text-main)] sm:text-base">
            You don&apos;t read emails wrong.
          </p>
          <p className="mt-0.5 text-[15px] leading-[1.22] text-[#b5aba8] sm:text-base">
            You get manipulated.
          </p>

          <div className="mt-2 space-y-0.5 text-[12.5px] leading-[1.28] sm:text-[13px]">
            <p className="text-[#c9beb9]">OpenMail detects it instantly.</p>
            <p>But it never decides for you.</p>
            <p>No tracking.</p>
            <p>No data collection.</p>
            <p>No hidden actions.</p>
            <p className="text-[#b5aba8]">Not even us.</p>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-[#6a5e5b]">
            Built for protection. Designed for trust.
          </p>
        </section>

        {/* SCAM MECHANICS — inline */}
        <section className="mt-2 border-t border-[#6a4444]/30 pt-2 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-0.5 text-[12px] font-medium text-[#a49794] sm:gap-x-8 sm:text-[13px]">
            <span>Urgency</span>
            <span>Pressure</span>
            <span>Authority</span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-[#b5aba8] sm:text-[13px]">
            That&apos;s how scams work.
          </p>
          <p className="mt-1 text-[13px] font-semibold text-[#d4ccc8] sm:text-sm">
            OpenMail sees what others miss.
          </p>
        </section>

        {/* INVESTOR BAIT — dense */}
        <section className="mt-2 border-t border-[#6a4444]/30 pt-2 text-left opacity-[0.88]">
          <p className="text-[12px] leading-[1.28] text-[#a89e9a] sm:text-[12.5px]">
            OpenMail doesn&apos;t filter emails.
            <br />
            It reads intent.
          </p>
          <ul className="mt-1.5 space-y-0 font-mono text-[11px] leading-[1.35] text-[#8a7e7a] sm:text-[11.5px]">
            <li>→ Intent analysis</li>
            <li>→ Behavioral patterns</li>
            <li>→ Domain validation</li>
            <li>→ Risk scoring</li>
            <li>→ Autonomous protection</li>
          </ul>
          <p className="mt-1.5 text-[12px] leading-[1.25] text-[#948a86] sm:text-[12.5px]">
            No rules. Just decisions.
          </p>
        </section>

        {/* FINAL */}
        <section className="mt-2 border-t border-[#6a4444]/30 pt-2.5 text-center">
          <p className="text-[15px] leading-[1.2] md:text-base">You don&apos;t need a better inbox.</p>
          <p className="mt-1 text-[1.15rem] font-semibold leading-[1.2] text-[#e8e0de] sm:text-[1.25rem]">
            You need control.
          </p>
        </section>
      </main>
    </div>
  );
}
