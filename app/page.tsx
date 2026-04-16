import Link from "next/link";

export default function Page() {
  return (
    <div
      className="flex h-screen max-h-screen w-full flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 95% 70% at 50% 22%, #140c0c 0%, #0a0707 38%, #050505 72%)",
      }}
    >
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[720px] flex-col justify-between px-6 pb-4 pt-4">
        {/* Hero — top dominance */}
        <section className="shrink-0 text-center">
          <h1 className="text-[clamp(40px,6vmin,52px)] font-bold leading-[0.98] tracking-[-0.02em] text-[#f7f5f4]">
            OpenMail
          </h1>
          <div className="mt-2 space-y-2 leading-[1.28] text-[clamp(14px,1.9vmin,16px)] text-[#9d948f]">
            <p>Your inbox is being manipulated.</p>
            <p>OpenMail sees it.</p>
            <p>Before you do.</p>
          </div>

          <Link
            href="/openmail"
            prefetch={false}
            className="mt-3 inline-block rounded-[10px] border border-[#5c3535]/80 bg-[#3d2222] px-6 py-3 text-[15px] font-semibold leading-tight text-[#fffefd] no-underline shadow-[0_0_0_1px_rgba(90,45,45,0.4),0_0_40px_rgba(110,40,40,0.18)] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-[#351d1d] hover:shadow-[0_0_0_1px_rgba(120,55,55,0.45),0_0_48px_rgba(130,45,45,0.22)] active:scale-[0.99]"
          >
            Secure my inbox
          </Link>

          <p className="mt-2 text-[12px] font-medium leading-tight tracking-wide text-[#6e6763]">
            No tracking. No data. Ever.
          </p>
        </section>

        {/* Center column: impact + ethics + intelligence */}
        <div className="flex min-h-0 w-full flex-1 flex-col justify-center overflow-hidden pt-8">
          {/* Core — visual centerpiece */}
          <section className="mb-4 shrink-0 rounded-lg py-4 text-left">
            <p className="text-[clamp(22px,3.8vmin,30px)] font-semibold leading-[1.12] tracking-[-0.015em] text-[#ece8e5]">
              You don&apos;t read emails wrong.
            </p>
            <p className="mt-2 text-[clamp(28px,5vmin,40px)] font-extrabold leading-[1.08] tracking-[-0.02em] text-[#ffffff]">
              You get manipulated.
            </p>
          </section>

          {/* Ethics — trust */}
          <section className="mb-6 shrink-0 space-y-2 text-left text-[clamp(13px,1.75vmin,15px)] leading-[1.38] text-[#5c5652]">
            <p>OpenMail detects it instantly.</p>
            <p>
              But it{" "}
              <span className="font-semibold text-[#b5aca6]">never decides for you</span>.
            </p>
            <p>No tracking.</p>
            <p>No data collection.</p>
            <p>No hidden actions.</p>
            <p className="font-semibold text-[#d8d2cd]">
              You stay in control. Always.
            </p>
          </section>

          {/* Intelligence */}
          <section className="shrink-0 text-left">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#5a5450]">
              OpenMail doesn&apos;t filter emails.
            </p>
            <p className="mt-3 text-[clamp(24px,4.2vmin,34px)] font-bold leading-[1.1] tracking-[-0.02em] text-[#f2eeeb]">
              It reads intent.
            </p>
            <ul className="mt-3 space-y-2 font-mono text-[11.5px] leading-[1.45] text-[#6e6661] sm:text-[12px]">
              <li>Intent analysis</li>
              <li>Behavioral patterns</li>
              <li>Domain validation</li>
              <li>Risk scoring</li>
              <li>Autonomous protection</li>
            </ul>
            <p className="mt-3 text-[clamp(13px,1.75vmin,15px)] font-medium text-[#8a827c]">
              No rules. Just decisions.
            </p>
          </section>
        </div>

        {/* Final — bottom lock */}
        <section className="shrink-0 pb-0 text-center">
          <p className="text-[clamp(18px,2.6vmin,22px)] font-medium leading-snug text-[#c4bbb5]">
            You don&apos;t need a better inbox.
          </p>
          <p className="mt-2 text-[clamp(22px,3.2vmin,28px)] font-bold leading-[1.1] tracking-[-0.02em] text-[#f0ebe8]">
            You need <span className="font-black text-white">control</span>.
          </p>
        </section>
      </main>
    </div>
  );
}
