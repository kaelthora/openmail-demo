"use client";
import { useState } from "react";
import { apiUrl } from "@/lib/config";

type SecurityApiResult = Record<string, unknown> & {
  error?: string;
  risk_level?: string;
  summary?: string;
};

export default function SecurityDemo() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<SecurityApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyzeEmail() {
    setLoading(true);

    const res = await fetch(apiUrl("/api/security"), {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ email }),
    });

    const data = (await res.json()) as SecurityApiResult;
    setResult(data);
    setLoading(false);
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold mb-6">
        OpenMail Security Sandbox
      </h1>

      <textarea
        className="w-full border p-4 mb-4"
        rows={10}
        placeholder="Paste an email to analyze..."
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <button
        onClick={analyzeEmail}
        className="bg-black text-white px-6 py-3"
      >
        {loading ? "Analyzing..." : "Analyze Email"}
      </button>

      {/* SUCCESS */}
      {result && !result.error && (
        <div className="mt-8 border p-6">
          <h2 className="text-2xl font-bold mb-2">
            Risk: {result.risk_level?.toUpperCase()}
          </h2>
          <p className="mb-4">{result.summary}</p>

          <pre className="bg-gray-100 p-4 overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* ERROR */}
      {result?.error && (
        <div className="mt-8 border p-6 bg-red-50">
          <h2 className="text-xl font-bold text-red-600">
            API Error
          </h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}