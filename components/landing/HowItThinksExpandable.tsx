"use client";

import { useState } from "react";

export function HowItThinksExpandable() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-[#6a4444]/25 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left text-[11px] font-medium uppercase tracking-[0.14em] text-[#7a6e6b] transition-colors hover:text-[#9a908d]"
        aria-expanded={open}
      >
        {open ? "▼ " : "▶ "}
        See how it thinks
      </button>
      {open ? (
        <div className="mt-3 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6a5e5b]">
            AI Decision Core
          </p>
          <ul className="mt-2 space-y-1.5 font-mono text-[11px] leading-snug text-[#8a7e7a]">
            <li>→ Signal extraction</li>
            <li>→ Intent classification</li>
            <li>→ Trust scoring</li>
            <li>→ Action recommendation</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
