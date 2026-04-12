import { cacheLife, cacheTag } from "next/cache";

import {
  ProgramFilm,
  TmdbFilmEnrichment,
} from "@/lib/types/screenings";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

interface TmdbSearchResult {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
}

interface TmdbMovieDetails {
  genres: Array<{ id: number; name: string }>;
  id: number;
  overview: string | null;
  poster_path: string | null;
  release_date: string | null;
  runtime: number | null;
  title: string;
  credits?: {
    crew?: Array<{
      job?: string | null;
      name?: string | null;
    }>;
  };
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\(\d{4}\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function fetchTmdbJson<T>(path: string) {
  const token = process.env.TMDB_API_KEY;

  if (!token) {
    return null;
  }

  const response = await fetch(`${TMDB_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`TMDB request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getFilmTmdbEnrichment(
  title: string,
  releaseDate: string | null
): Promise<TmdbFilmEnrichment | null> {
  "use cache";

  cacheLife("days");
  cacheTag(`tmdb:${normalizeTitle(title)}`);

  const search = await fetchTmdbJson<{ results: TmdbSearchResult[] }>(
    `/search/movie?query=${encodeURIComponent(title)}`
  );

  if (!search) {
    return null;
  }

  const releaseYear = releaseDate?.slice(0, 4) ?? null;
  const normalizedTitle = normalizeTitle(title);
  const candidate = search.results.find((result) => {
    const candidateTitle = normalizeTitle(result.title);
    const candidateYear = result.release_date?.slice(0, 4) ?? null;

    if (candidateTitle !== normalizedTitle) {
      return false;
    }

    if (!releaseYear || !candidateYear) {
      return true;
    }

    return candidateYear === releaseYear;
  });

  if (!candidate) {
    return null;
  }

  const details = await fetchTmdbJson<TmdbMovieDetails>(
    `/movie/${candidate.id}?append_to_response=credits`
  );

  if (!details) {
    return null;
  }

  return {
    tmdbId: details.id,
    posterPath: details.poster_path
      ? `${TMDB_IMAGE_BASE_URL}${details.poster_path}`
      : null,
    overview: details.overview,
    releaseDate: details.release_date,
    runtimeMinutes: details.runtime,
    genres: details.genres.map((genre) => genre.name),
    director:
      details.credits?.crew?.find((member) => member.job === "Director")?.name ??
      null,
    matchConfidence: "high",
  };
}

export async function enrichProgramFilm(
  film: Omit<ProgramFilm, "tmdb">
): Promise<ProgramFilm> {
  const tmdb = await getFilmTmdbEnrichment(
    film.title,
    film.sourceEnrichment.releaseDate
  );

  return {
    ...film,
    tmdb,
  };
}
