import Link from "next/link";

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#020617] via-[#020617] to-[#030b1a] text-white">
      {/* SECTION 1 — HERO */}
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">OpenMail</h1>

        <p className="mt-6 max-w-xl text-xl text-gray-300 md:text-2xl">
          An inbox that thinks before you act.
        </p>

        <Link
          href="/openmail"
          prefetch={false}
          className="mt-10 inline-block rounded-lg bg-white px-6 py-3 font-medium text-black transition hover:scale-105"
        >
          Secure my inbox
        </Link>

        <p className="mt-4 text-sm text-gray-500">No tracking. No data. Ever.</p>
      </div>

      {/* SECTION 2 — THREAT */}
      <div className="mx-auto max-w-4xl px-6 py-32 text-left">
        <p className="text-3xl font-medium leading-snug md:text-4xl">
          You don&apos;t read emails wrong.
        </p>

        <p className="mt-2 text-3xl font-medium text-gray-400 md:text-4xl">You get manipulated.</p>

        <div className="mt-10 space-y-2 text-xl text-gray-400">
          <p>Urgency.</p>
          <p>Pressure.</p>
          <p>Authority.</p>
        </div>

        <p className="mt-6 text-xl">That&apos;s how scams work.</p>
      </div>

      {/* SECTION 3 — IMPACT */}
      <div className="py-32 text-center">
        <p className="text-4xl font-semibold md:text-5xl">OpenMail sees it first.</p>
      </div>

      {/* SECTION 4 — AI + HUMAN */}
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-32 text-center">
        <p className="text-2xl">Human instinct.</p>
        <p className="text-2xl text-gray-400">AI precision.</p>
        <p className="text-2xl">Working together.</p>
      </div>

      {/* SECTION 5 — FUNCTION */}
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-32 text-center text-gray-400">
        <p>Detects scams.</p>
        <p>Flags manipulation.</p>
        <p>Stops bad decisions.</p>
      </div>

      {/* SECTION 6 — FINAL */}
      <div className="py-32 text-center">
        <p className="text-3xl md:text-4xl">You don&apos;t need a better inbox.</p>

        <p className="mt-4 text-4xl font-semibold md:text-5xl">You need protection.</p>
      </div>
    </div>
  );
}
