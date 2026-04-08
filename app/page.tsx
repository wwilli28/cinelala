import { Suspense } from "react";

import HomeClient from "@/app/ui/home-client";
import { theaters } from "@/lib/constants/theaters";
import { getHomepagePrograms } from "@/lib/data/get-screenings";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { connection } from "next/server";

async function HomeContent() {
  await connection();
  const { programs, statuses } = await getHomepagePrograms();
  const supabase = await getSupabaseServerClient();
  const supabaseConfigured = isSupabaseConfigured();
  let userEmail: string | null = null;
  let favoriteFilmIds: string[] = [];

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    userEmail = user?.email ?? null;

    if (user) {
      const { data } = await supabase
        .from("favorites")
        .select("film_id")
        .order("created_at", { ascending: false });

      favoriteFilmIds = (data ?? [])
        .map((favorite) => favorite.film_id)
        .filter((filmId): filmId is string => typeof filmId === "string");
    }
  }

  return (
    <HomeClient
      key={`${userEmail ?? "guest"}:${favoriteFilmIds.length}`}
      programs={programs}
      statuses={statuses}
      theaters={theaters}
      initialFavoriteFilmIds={favoriteFilmIds}
      userEmail={userEmail}
      supabaseConfigured={supabaseConfigured}
    />
  );
}

function HomeFallback() {
  return <main className="min-h-screen bg-white" />;
}

export default function Home() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
