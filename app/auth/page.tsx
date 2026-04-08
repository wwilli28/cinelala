import Link from "next/link";

import AuthForm from "@/app/ui/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function AuthPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">
            Cine LaLa
          </p>
          <h1 className="mt-4 text-4xl font-semibold">My Favs Login</h1>
          <p className="mt-3 text-zinc-400">
            Sign in or create an account to save favorites across visits.
          </p>
        </div>

        {configured ? (
          <AuthForm />
        ) : (
          <div className="rounded-2xl border border-amber-700/60 bg-amber-950/40 p-5 text-sm text-amber-100">
            Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
            to enable login.
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-zinc-400 transition hover:text-white">
            Back to showtimes
          </Link>
        </div>
      </div>
    </main>
  );
}
