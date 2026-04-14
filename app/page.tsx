import Link from "next/link";

export default function Page() {
  return (
    <div className="h-screen w-full overflow-hidden bg-gradient-to-br from-[#020617] via-[#020617] to-[#030b1a] text-white">
      {/* HERO */}
      <main className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-6 py-4">
        <section className="text-center">
          <h1 className="text-4xl font-semibold md:text-6xl">OpenMail</h1>
          <p className="mt-2 text-base text-gray-300 md:text-lg">
          An inbox that thinks before you act.
          </p>

          <Link
            href="/openmail"
            prefetch={false}
            className="mt-4 inline-block rounded-lg bg-white px-5 py-2 text-sm font-medium text-black no-underline transition hover:scale-105"
          >
            Secure my inbox
          </Link>

          <p className="mt-2 text-xs text-gray-500">No tracking. No data. Ever.</p>
        </section>

        {/* THREAT */}
        <section className="mt-5 border-t border-white/5 pt-4 text-left">
          <p className="text-xl font-medium md:text-2xl">You don&apos;t read emails wrong.</p>
          <p className="mt-1 text-xl text-gray-400 md:text-2xl">You get manipulated.</p>

          <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-gray-400 md:text-base">
            <p>Urgency.</p>
            <p>Pressure.</p>
            <p>Authority.</p>
          </div>

          <p className="mt-2 text-sm md:text-base">That&apos;s how scams work.</p>
        </section>

        {/* IMPACT */}
        <section className="mt-4 border-t border-white/5 pt-4 text-center">
          <p className="text-2xl font-semibold md:text-3xl">OpenMail sees it first.</p>
        </section>

        {/* AI + HUMAN */}
        <section className="mt-4 border-t border-white/5 pt-4 text-center">
          <div className="grid grid-cols-3 gap-2 text-sm md:text-base">
            <p>Human instinct.</p>
            <p className="text-gray-400">AI precision.</p>
            <p>Working together.</p>
          </div>
        </section>

        {/* FUNCTION */}
        <section className="mt-4 border-t border-white/5 pt-4 text-center text-sm text-gray-400 md:text-base">
          <div className="grid grid-cols-3 gap-2">
            <p>Detects scams.</p>
            <p>Flags manipulation.</p>
            <p>Stops bad decisions.</p>
          </div>
        </section>

        {/* FINAL */}
        <section className="mt-4 border-t border-white/5 pt-4 text-center">
          <p className="text-xl md:text-2xl">You don&apos;t need a better inbox.</p>
          <p className="mt-1 text-2xl font-semibold md:text-3xl">You need protection.</p>
        </section>
      </main>
    </div>
  );
}
