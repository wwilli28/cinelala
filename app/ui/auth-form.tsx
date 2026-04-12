"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "sign-in" | "sign-up";

export default function AuthForm({
  className,
  accent = "default",
}: {
  className?: string;
  accent?: "default" | "amber";
}) {
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

  const accentClasses =
    accent === "amber"
      ? {
          label: "text-amber-300",
          inactiveTab: "border border-amber-400/60 text-amber-300",
          input: "border-amber-400/40 focus:border-amber-300",
          message: "text-amber-200",
        }
      : {
          label: "text-zinc-300",
          inactiveTab: "border border-zinc-700 text-white",
          input: "border-zinc-800 focus:border-zinc-600",
          message: "text-zinc-300",
        };

  return (
    <div
      className={`rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 ${className ?? ""}`}
    >
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
                : accentClasses.inactiveTab
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className={`mb-2 block text-sm ${accentClasses.label}`}>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`w-full rounded-xl border bg-black px-4 py-3 text-white outline-none transition ${accentClasses.input}`}
          />
        </label>

        <label className="block">
          <span className={`mb-2 block text-sm ${accentClasses.label}`}>Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`w-full rounded-xl border bg-black px-4 py-3 text-white outline-none transition ${accentClasses.input}`}
          />
        </label>

        {message ? <p className={`text-sm ${accentClasses.message}`}>{message}</p> : null}

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
