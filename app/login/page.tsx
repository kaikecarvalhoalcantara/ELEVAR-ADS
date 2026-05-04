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
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-neutral-950 via-purple-950/20 to-neutral-950">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-2xl"
      >
        <div className="text-center">
          <div className="text-3xl mb-2">⚡</div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            ELEVAR ADS
          </h1>
          <p className="text-xs text-neutral-400 mt-2">
            Automatize anúncios verticais em segundos
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-neutral-300">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="mt-1 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2.5 focus:border-purple-500 focus:outline-none transition-colors"
          />
        </label>
        {error && (
          <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-lg p-2.5">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-lg"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
        {/* V63: dica de multi-device */}
        <div className="border-t border-neutral-800 pt-3 text-[11px] text-neutral-500 leading-relaxed text-center">
          🌐 Multi-dispositivo — todos os seus anúncios e configurações ficam
          salvos na nuvem. Pode acessar do PC, notebook ou celular com a
          mesma senha. Sessão dura 30 dias.
        </div>
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
