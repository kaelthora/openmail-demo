export default function Page() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#020617] via-[#020617] to-[#030b1a] text-white">
      {/* HERO */}
      <section className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-6xl md:text-7xl font-semibold">OpenMail</h1>
        <p className="mt-6 text-xl text-gray-300">
          An inbox that thinks before you act.
        </p>

        <button className="mt-10 px-6 py-3 rounded-lg bg-white text-black font-medium hover:scale-105 transition">
          Secure my inbox
        </button>

        <p className="mt-4 text-sm text-gray-500">
          No tracking. No data. Ever.
        </p>
      </section>

      {/* THREAT */}
      <section className="py-20 md:py-24 px-6 max-w-4xl mx-auto text-left border-t border-white/5">
        <p className="text-4xl font-medium">
          You don&apos;t read emails wrong.
        </p>
        <p className="text-4xl text-gray-400 mt-2">
          You get manipulated.
        </p>

        <div className="mt-10 space-y-2 text-xl text-gray-400">
          <p>Urgency.</p>
          <p>Pressure.</p>
          <p>Authority.</p>
        </div>

        <p className="mt-6 text-xl">
          That&apos;s how scams work.
        </p>
      </section>

      {/* IMPACT */}
      <section className="py-20 md:py-24 text-center border-t border-white/5">
        <p className="text-5xl font-semibold">
          OpenMail sees it first.
        </p>
      </section>

      {/* AI + HUMAN */}
      <section className="py-20 md:py-24 text-center space-y-4 border-t border-white/5">
        <p className="text-2xl">Human instinct.</p>
        <p className="text-2xl text-gray-400">AI precision.</p>
        <p className="text-2xl">Working together.</p>
      </section>

      {/* FUNCTION */}
      <section className="py-20 md:py-24 text-center space-y-2 text-gray-400 border-t border-white/5">
        <p>Detects scams.</p>
        <p>Flags manipulation.</p>
        <p>Stops bad decisions.</p>
      </section>

      {/* FINAL */}
      <section className="py-20 md:py-24 text-center border-t border-white/5">
        <p className="text-3xl">
          You don&apos;t need a better inbox.
        </p>
        <p className="text-5xl font-semibold mt-4">
          You need protection.
        </p>
      </section>
    </div>
  );
}
