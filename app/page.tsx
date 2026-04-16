import Link from "next/link";

export default function Page() {
  return (
    <div
      className="flex h-screen max-h-screen w-full flex-col items-center justify-center overflow-hidden px-5 py-3"
      style={{ backgroundColor: "#050505" }}
    >
      <main className="flex w-full min-h-0 max-h-full max-w-[720px] flex-col items-center justify-center">
        <div className="flex w-full min-h-0 max-h-full flex-col gap-4 overflow-hidden text-[clamp(14px,1.85vmin,16px)] leading-[1.28] text-[#b8b0ab]">
          {/* Hero — tight, impactful */}
          <section className="shrink-0 text-center">
            <h1 className="text-[clamp(40px,5.5vmin,48px)] font-bold leading-[1.05] tracking-tight text-[#f5f2f0]">
              OpenMail
            </h1>
            <div className="mt-1 space-y-0 text-[clamp(14px,1.85vmin,16px)] leading-[1.35] text-[#c9c2bd]">
              <p>Your inbox is being manipulated.</p>
              <p>OpenMail sees it.</p>
              <p>Before you do.</p>
            </div>

            <Link
              href="/openmail"
              prefetch={false}
              className="mt-2 inline-block rounded-lg border border-[#6a4444]/55 bg-[#5c3838] px-5 py-2 text-[15px] font-semibold leading-tight text-[#f8f4f3] no-underline shadow-[0_0_0_1px_rgba(106,68,68,0.25)] transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#4a2d2d] hover:shadow-[0_0_24px_rgba(120,60,60,0.15)]"
            >
              Secure my inbox
            </Link>

            <p className="mt-2 text-[13px] leading-tight text-[#8a827d]">
              No tracking. No data. Ever.
            </p>
          </section>

          {/* Core — compact */}
          <section className="shrink-0 border-t border-[#2a2424] pt-4 text-left">
            <p className="text-[clamp(20px,2.4vmin,24px)] font-semibold leading-[1.2] text-[#ebe6e3]">
              You don&apos;t read emails wrong.
            </p>
            <p className="mt-1 text-[clamp(22px,2.65vmin,26px)] font-bold leading-[1.18] text-[#faf8f6]">
              You get manipulated.
            </p>

            <div className="mt-2 space-y-0 text-[clamp(14px,1.85vmin,16px)] leading-[1.35] text-[#c4bcb7]">
              <p>OpenMail detects it instantly.</p>
              <p>But it never decides for you.</p>
              <p>No tracking.</p>
              <p>No data collection.</p>
              <p>No hidden actions.</p>
              <p className="text-[#b5aea9]">Not even us.</p>
            </div>
          </section>

          {/* AI / investor */}
          <section className="shrink-0 border-t border-[#2a2424] pt-4 text-left">
            <p className="text-[clamp(14px,1.85vmin,16px)] font-medium text-[#a69e99]">
              OpenMail doesn&apos;t filter emails.
            </p>
            <p className="mt-1.5 text-[clamp(22px,2.65vmin,26px)] font-bold leading-[1.2] text-[#faf8f6]">
              It reads intent.
            </p>
            <ul className="mt-2 space-y-0.5 font-mono text-[13px] leading-[1.4] text-[#9a928d]">
              <li>→ Intent analysis</li>
              <li>→ Behavioral patterns</li>
              <li>→ Domain validation</li>
              <li>→ Risk scoring</li>
              <li>→ Autonomous protection</li>
            </ul>
            <p className="mt-2 text-[clamp(14px,1.85vmin,16px)] font-medium text-[#a89f9a]">
              No rules. Just decisions.
            </p>
          </section>

          {/* Final */}
          <section className="shrink-0 border-t border-[#2a2424] pt-4 text-center">
            <p className="text-[clamp(20px,2.4vmin,24px)] font-semibold text-[#e8e3e0]">
              You don&apos;t need a better inbox.
            </p>
            <p className="mt-1 text-[clamp(22px,2.7vmin,26px)] font-bold leading-[1.12] text-[#ffffff]">
              You need control.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
