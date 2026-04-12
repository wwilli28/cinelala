import { Suspense } from "react";

import HomeClient from "@/app/ui/home-client";
import { theaters } from "@/lib/constants/theaters";
import { getHomepagePrograms } from "@/lib/data/get-screenings";
import { isSupabaseConfigured } from "@/lib/supabase/env";

async function HomeContent() {
  const { programs, statuses } = await getHomepagePrograms();
  const supabaseConfigured = isSupabaseConfigured();

  return (
    <HomeClient
      programs={programs}
      statuses={statuses}
      theaters={theaters}
      supabaseConfigured={supabaseConfigured}
    />
  );
}

function HomeFallback() {
  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="mb-8 flex min-h-[18rem] items-center justify-center md:min-h-[20rem]">
          <div className="h-24 w-72 rounded-2xl bg-zinc-900/80 md:h-28 md:w-96" />
        </div>
        <div className="mb-8 flex flex-wrap justify-center gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`filter-skeleton-${index}`}
              className="h-32 w-32 rounded-full border border-zinc-800 bg-zinc-950"
            />
          ))}
        </div>
        <div className="space-y-8">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`card-skeleton-${index}`} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <div className="mb-4 aspect-[2/3] rounded-xl bg-zinc-900" />
              <div className="mb-3 h-5 w-2/3 rounded bg-zinc-900" />
              <div className="mb-2 h-4 w-1/2 rounded bg-zinc-900" />
              <div className="h-4 w-1/3 rounded bg-zinc-900" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
