"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "sign-in" | "sign-up";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const response =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setSubmitting(false);

    if (response.error) {
      setMessage(response.error.message);
      return;
    }

    if (mode === "sign-up" && !response.data.session) {
      setMessage("Account created. Check your email to confirm your login.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6">
      <div className="mb-6 flex gap-2">
        {[
          { id: "sign-in", label: "Sign in" },
          { id: "sign-up", label: "Create account" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setMode(item.id as AuthMode);
              setMessage(null);
            }}
            className={`rounded-full px-4 py-2 text-sm transition ${
              mode === item.id
                ? "bg-white text-black"
                : "border border-zinc-700 text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white outline-none transition focus:border-zinc-600"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white outline-none transition focus:border-zinc-600"
          />
        </label>

        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? "Working..."
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}
