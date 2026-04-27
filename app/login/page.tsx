"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Senha incorreta");
        setBusy(false);
        return;
      }
      const next = params.get("next") || "/";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 bg-neutral-950 border border-neutral-800 rounded-lg p-6"
      >
        <div>
          <h1 className="text-xl font-semibold">Automador de Ads</h1>
          <p className="text-sm text-neutral-400 mt-1">Acesso restrito</p>
        </div>
        <label className="block">
          <span className="text-sm">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2"
          />
        </label>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded p-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 font-semibold"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
