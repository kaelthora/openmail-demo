"use client";

import { useEffect, useState } from "react";

export default function BootScreen({ onFinish }: { onFinish: () => void }) {
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFade(true), 2000);
    const t2 = setTimeout(() => onFinish(), 3200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onFinish]);

  return (
    <div className={`boot-screen ${fade ? "fade-out" : ""}`}>
      <img src="/openmail-bg.png" className="boot-image" />
      <div className="boot-overlay" />

      {/* 💥 LIGHT SWEEP */}
      <div className="boot-sweep" />
    </div>
  );
}