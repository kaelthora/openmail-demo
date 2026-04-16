import Link from "next/link";

export default function Page() {
  return (
    <div className="h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(108,66,66,0.045)_0%,rgba(10,10,10,0)_35%),radial-gradient(circle_at_82%_4%,rgba(108,66,66,0.03)_0%,rgba(10,10,10,0)_38%),#0a0a0a] text-[var(--text-main)]">
      {/* HERO */}
      <main className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-6 py-4">
        <section className="text-center">
          <h1 className="text-4xl font-semibold md:text-6xl">OpenMail</h1>
          <p className="mt-2 text-base text-[#b5aba8] md:text-lg">
            Your inbox is being manipulated. OpenMail stops it.
          </p>

          <Link
            href="/openmail"
            prefetch={false}
            className="mt-4 inline-block rounded-lg border border-[#6a4444]/55 bg-[#6f4747] px-5 py-2 text-sm font-medium text-[#f2e7e7] no-underline transition hover:scale-105 hover:bg-[#7a4d4d]"
          >
            Try OpenMail (see how it thinks)
          </Link>

          <p className="mt-2 text-xs text-[#9a908d]">No tracking. No data. Ever.</p>
        </section>

        <section className="mt-4 border-t border-[#6a4444]/35 pt-4 text-left text-sm text-[#b5aba8] md:text-base">
          <p className="font-semibold text-[var(--text-main)]">Example</p>
          <p className="mt-2 text-[#a49794]">Email: &quot;URGENT: verify your account&quot;</p>
          <p className="mt-2">OpenMail analysis:</p>
          <p className="mt-1">→ Domain mismatch (googgle.com)</p>
          <p>→ Intent: pressure + impersonation</p>
          <p className="text-[#9c6a6a]">→ Decision: BLOCKED</p>
        </section>

        {/* THREAT */}
        <section className="mt-5 border-t border-[#6a4444]/35 pt-4 text-left">
          <p className="text-xl font-medium md:text-2xl">You don&apos;t read emails wrong.</p>
          <p className="mt-1 text-xl text-[#b5aba8] md:text-2xl">You get manipulated.</p>

          <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-[#a49794] md:text-base">
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

        {/* FINAL */}
        <section className="mt-4 border-t border-[#6a4444]/35 pt-4 text-center">
          <p className="text-xl md:text-2xl">You don&apos;t need a better inbox.</p>
          <p className="mt-1 text-2xl font-semibold md:text-3xl">
            Most scams don&apos;t look like scams.
            <br />
            That&apos;s why they work.
          </p>
        </section>
      </main>
    </div>
  );
}
