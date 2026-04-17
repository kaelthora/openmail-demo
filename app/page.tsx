"use client";

import Link from "next/link";
import { useAppMode } from "./AppModeProvider";

export default function Page() {
  const { setAppMode } = useAppMode();

  return (
    <div
      className="flex min-h-screen h-screen w-full flex-col items-center justify-center overflow-hidden px-6 py-8"
      style={{
        background:
          "radial-gradient(ellipse 95% 70% at 50% 22%, #140c0c 0%, #0a0707 38%, #050505 72%)",
      }}
    >
      <main className="flex w-full max-w-xl flex-col gap-5 text-center">
        {/* 1–2: Title + subtitle + CTA */}
        <section className="shrink-0">
          <h1 className="text-[clamp(40px,6vmin,52px)] font-bold leading-[0.98] tracking-[-0.02em] text-[#f7f5f4]">
            OpenMail
          </h1>
          <div className="mt-2 space-y-1 leading-[1.28] text-[clamp(14px,1.9vmin,16px)] text-[#9d948f]">
            <p>Your inbox is being manipulated.</p>
            <p>OpenMail sees it.</p>
            <p>Before you do.</p>
          </div>

          <Link
            href="/openmail?mode=real"
            prefetch={false}
            onClick={() => setAppMode("real")}
            className="mt-2 inline-block w-[min(100%,24rem)] rounded-[10px] border border-[#5c3535]/80 bg-[#3d2222] px-6 py-3 text-[15px] font-semibold leading-tight text-[#fffefd] no-underline shadow-[0_0_0_1px_rgba(90,45,45,0.4),0_0_40px_rgba(110,40,40,0.18)] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-[#351d1d] hover:shadow-[0_0_0_1px_rgba(120,55,55,0.45),0_0_48px_rgba(130,45,45,0.22)] active:scale-[0.99]"
          >
            Try OpenMail (see how it thinks with your inbox)
          </Link>

          <p className="mt-2 text-[12px] font-medium leading-tight tracking-wide text-[#6e6763]">
            No tracking. No data. Ever.
          </p>
          <Link
            href="/openmail?mode=demo"
            prefetch={false}
            onClick={() => setAppMode("demo")}
            className="mt-2 inline-block w-[min(100%,24rem)] rounded-[10px] border border-[#8f5e3b]/55 bg-transparent px-6 py-3 text-[13px] font-medium leading-tight text-[#b08d78]/80 no-underline shadow-[0_0_0_1px_rgba(143,94,59,0.15),0_0_20px_rgba(143,94,59,0.09)] transition-[border-color,box-shadow,opacity] duration-200 ease-out hover:border-[#b0774f]/70 hover:opacity-100 hover:shadow-[0_0_0_1px_rgba(176,119,79,0.24),0_0_26px_rgba(176,119,79,0.16)]"
          >
            Try demo (pre-loaded threats)
          </Link>
        </section>

        {/* 3: Main statement */}
        <section className="shrink-0 rounded-lg py-3">
          <p className="text-[clamp(22px,3.8vmin,30px)] font-semibold leading-[1.12] tracking-[-0.015em] text-[#ece8e5]">
            You don&apos;t read emails wrong.
          </p>
          <p className="mt-2 text-[clamp(28px,5vmin,40px)] font-extrabold leading-[1.08] tracking-[-0.02em] text-[#ffffff]">
            You get manipulated.
          </p>
        </section>

        {/* 4: Ethics */}
        <section className="shrink-0 space-y-1 text-[clamp(13px,1.75vmin,15px)] leading-[1.38] text-[#5c5652]">
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

        {/* 5: It reads intent + list */}
        <section className="shrink-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#5a5450]">
            OpenMail doesn&apos;t filter emails.
          </p>
          <p className="mt-2 text-[clamp(24px,4.2vmin,34px)] font-bold leading-[1.1] tracking-[-0.02em] text-[#f2eeeb]">
            It reads intent.
          </p>
          <ul className="mt-2 inline-block space-y-1 text-left font-mono text-[11.5px] leading-[1.45] text-[#6e6661] sm:text-[12px]">
            <li>Intent analysis</li>
            <li>Behavioral patterns</li>
            <li>Domain validation</li>
            <li>Risk scoring</li>
            <li>Autonomous protection</li>
          </ul>
          <p className="mt-2 text-[clamp(13px,1.75vmin,15px)] font-medium text-[#8a827c]">
            No rules. Just decisions.
          </p>
        </section>

        {/* 6: Final */}
        <section className="shrink-0">
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
