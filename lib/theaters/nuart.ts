import { cacheLife, cacheTag } from "next/cache";

import { getTheater } from "@/lib/constants/theaters";
import { enrichProgramFilm } from "@/lib/enrichment/tmdb";
import { getBusinessDate } from "@/lib/ingestion/time";
import { TheaterProgramsResult } from "@/lib/types/screenings";

const LANDMARK_DATA_ROOT =
  "https://cms-assets.webediamovies.pro/prod/landmarktheatres/2026-04-07/public/page-data/sq/d";
const LANDMARK_EVENTS_QUERY_URL = `${LANDMARK_DATA_ROOT}/3362424247.json`;
const LANDMARK_MOVIES_QUERY_URL = `${LANDMARK_DATA_ROOT}/3360083659.json`;
const NUART_THEATER_ID = "X00CW";
const NUART_EVENT_TYPES = new Set([
  "Q&A",
  "Sneak Preview",
  "Classic Series",
  "Late Shows",
  "Special Screenings",
  "Film Series",
  "Sunset Events",
]);

interface LandmarkEventShowtime {
  movie?: {
    id?: string | null;
  } | null;
  showtimes?: Array<[string | null, string | null]> | null;
}

interface LandmarkEventNode {
  id: string;
  title?: string | null;
  type?: string | null;
  path?: string | null;
  shortDescription?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  visibleStartAt?: string | null;
  visibleEndAt?: string | null;
  timeZone?: string | null;
  theaters?: Array<{
    id?: string | null;
  }> | null;
  poster?: string | null;
  priority?: string | null;
  bookingUrl?: string | null;
  relatedMovies?: LandmarkEventShowtime[] | null;
}

interface LandmarkMovieNode {
  id: string;
  title?: string | null;
  path?: string | null;
  poster?: string | null;
  synopsis?: string | null;
  direction?: string | null;
  runtime?: number | null;
  release?: string | null;
}

interface LandmarkEventsResponse {
  data?: {
    allEvent?: {
      nodes?: LandmarkEventNode[];
    };
  };
}

interface LandmarkMoviesResponse {
  data?: {
    allMovie?: {
      nodes?: LandmarkMovieNode[];
    };
  };
}

interface LandmarkGroupedProgram {
  id: string;
  sourceUrl: string;
  ticketUrl: string | null;
  date: string;
  displayDate: string;
  startTime: string | null;
  title: string | null;
  filmId: string;
  filmTitle: string;
  filmPosterUrl: string | null;
  filmOverview: string | null;
  filmReleaseDate: string | null;
  filmRuntimeMinutes: number | null;
  filmDirector: string | null;
  showtimes: Array<{
    time: string;
    ticketUrl: string | null;
    soldOut: boolean;
  }>;
  specialGuests: string[];
  notes: string | null;
  sourceImageUrl: string | null;
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Landmark request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function cleanEventType(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function hasNuartTheater(
  theaters: LandmarkEventNode["theaters"] | LandmarkMovieNode["path"]
): theaters is LandmarkEventNode["theaters"] {
  return Array.isArray(theaters);
}

function isNuartEvent(event: LandmarkEventNode) {
  const theaters = hasNuartTheater(event.theaters) ? (event.theaters ?? []) : [];
  return theaters.some((theater) => theater.id === NUART_THEATER_ID);
}

function isRelevantNuartType(event: LandmarkEventNode) {
  const eventType = cleanEventType(event.type);
  return NUART_EVENT_TYPES.has(eventType);
}

function stripNuartPrefix(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/^Landmark'?s Nuart Theatre\s*-\s*/i, "")
    .trim();
}

function parseSqlDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/
  );

  if (!match) {
    return null;
  }

  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
  };
}

function parseIsoDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const iso = date.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
  };
}

function getProgramDateTime(
  event: LandmarkEventNode,
  showtime: [string | null, string | null] | null | undefined
) {
  const [start, end] = showtime ?? [null, null];
  const parsedStart = parseSqlDateTime(start);
  const parsedEnd = parseSqlDateTime(end);

  if (parsedStart) {
    const inferredTime =
      parsedEnd &&
      parsedStart.time === "03:00" &&
      parsedEnd.time === "03:00" &&
      parsedStart.date !== parsedEnd.date
        ? null
        : parsedStart.time;

    return {
      date: parsedStart.date,
      startTime: inferredTime,
    };
  }

  const eventStart = parseIsoDateTime(event.startAt) ?? parseIsoDateTime(event.visibleStartAt);

  if (eventStart) {
    return {
      date: eventStart.date,
      startTime: eventStart.time,
    };
  }

  return null;
}

function isCineInsomniaLateShow(event: LandmarkEventNode) {
  const eventType = cleanEventType(event.type);
  const title = event.title ?? "";

  return (
    /cine insomnia/i.test(title) ||
    (eventType === "Late Shows" && /nuart/i.test(title))
  );
}

function getSpecialGuests(event: LandmarkEventNode) {
  const lines = [event.title, event.shortDescription]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => /q&a|in person|intro|guest|moderated by/i.test(value));

  return Array.from(new Set(lines));
}

function getNotes(event: LandmarkEventNode, filmTitle: string) {
  const cleanedTitle = stripNuartPrefix(event.title) ?? event.title ?? null;
  const parts = [cleanedTitle, event.shortDescription]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => value !== filmTitle);

  return parts.join("\n\n") || null;
}

function groupNuartPrograms(
  events: LandmarkEventNode[],
  moviesById: Map<string, LandmarkMovieNode>
) {
  const groupedPrograms = new Map<string, LandmarkGroupedProgram>();

  for (const event of events) {
    const sourceUrl = event.path
      ? `https://www.landmarktheatres.com${event.path}`
      : "https://www.landmarktheatres.com/our-locations/x00cw-landmark-nuart-theatre-west-los-angeles/";

    const relatedMovies = event.relatedMovies ?? [];
    const specialGuests = getSpecialGuests(event);

    for (const relatedMovie of relatedMovies) {
      const movieId = relatedMovie.movie?.id ?? null;

      if (!movieId) {
        continue;
      }

      const movie = moviesById.get(movieId);
      const filmTitle = movie?.title?.trim() || stripNuartPrefix(event.title) || "Untitled program";
      const showtimePairs: Array<[string | null, string | null]> =
        relatedMovie.showtimes && relatedMovie.showtimes.length > 0
          ? relatedMovie.showtimes
          : [[null, null]];

      for (const showtime of showtimePairs) {
        const dateTime = getProgramDateTime(event, showtime);

        if (!dateTime) {
          continue;
        }

        const resolvedStartTime =
          dateTime.startTime ?? (isCineInsomniaLateShow(event) ? "22:30" : null);
        const displayDate = getBusinessDate(dateTime.date, resolvedStartTime);
        const groupKey = `${event.id}::${movieId}::${dateTime.date}`;
        const existingProgram = groupedPrograms.get(groupKey);

        if (existingProgram) {
          if (resolvedStartTime) {
            existingProgram.showtimes.push({
              time: resolvedStartTime,
              ticketUrl: event.bookingUrl ?? null,
              soldOut: false,
            });

            if (!existingProgram.startTime || resolvedStartTime < existingProgram.startTime) {
              existingProgram.startTime = resolvedStartTime;
            }
          }

          continue;
        }

        groupedPrograms.set(groupKey, {
          id: `nuart-${groupKey}`,
          sourceUrl,
          ticketUrl: event.bookingUrl ?? null,
          date: dateTime.date,
          displayDate,
          startTime: resolvedStartTime,
          title: null,
          filmId: movieId,
          filmTitle,
          filmPosterUrl: movie?.poster ?? event.poster ?? null,
          filmOverview: movie?.synopsis ?? null,
          filmReleaseDate: movie?.release ?? null,
          filmRuntimeMinutes: movie?.runtime ?? null,
          filmDirector: movie?.direction ?? null,
          showtimes: resolvedStartTime
            ? [
                {
                  time: resolvedStartTime,
                  ticketUrl: event.bookingUrl ?? null,
                  soldOut: false,
                },
              ]
            : [],
          specialGuests,
          notes: getNotes(event, filmTitle),
          sourceImageUrl: event.poster ?? movie?.poster ?? null,
        });
      }
    }
  }

  return Promise.all(
    Array.from(groupedPrograms.values()).map(async (program) => ({
      id: program.id,
      theater: "nuart" as const,
      sourceUrl: program.sourceUrl,
      ticketUrl: program.ticketUrl,
      date: program.date,
      displayDate: program.displayDate,
      startTime: program.startTime,
      title: program.title,
      films: [
        await enrichProgramFilm({
          id: `${program.id}::film::${program.filmId}`,
          title: program.filmTitle,
          startTime: program.startTime,
          sourceEnrichment: {
            posterUrl: program.filmPosterUrl,
            overview: program.filmOverview,
            releaseDate: program.filmReleaseDate,
            runtimeMinutes: program.filmRuntimeMinutes,
            format: null,
            director: program.filmDirector,
          },
        }),
      ],
      showtimes: program.showtimes.sort((first, second) =>
        first.time.localeCompare(second.time)
      ),
      format: null,
      specialGuests: program.specialGuests,
      notes: program.notes,
      sourceImageUrl: program.sourceImageUrl,
    }))
  );
}

export async function getNuartPrograms(): Promise<TheaterProgramsResult> {
  "use cache";

  cacheLife({
    stale: 60 * 30,
    revalidate: 60 * 60 * 6,
    expire: 60 * 60 * 24,
  });
  cacheTag("screenings:nuart");

  const theater = getTheater("nuart");

  if (!theater) {
    throw new Error("Missing Nuart theater definition");
  }

  try {
    const [eventsResponse, moviesResponse] = await Promise.all([
      fetchJson<LandmarkEventsResponse>(LANDMARK_EVENTS_QUERY_URL),
      fetchJson<LandmarkMoviesResponse>(LANDMARK_MOVIES_QUERY_URL),
    ]);
    const events =
      eventsResponse.data?.allEvent?.nodes?.filter(
        (event) => isNuartEvent(event) && isRelevantNuartType(event)
      ) ?? [];
    const movies =
      moviesResponse.data?.allMovie?.nodes?.filter((movie) => Boolean(movie.id)) ?? [];
    const moviesById = new Map(movies.map((movie) => [movie.id, movie]));
    const programs = await groupNuartPrograms(events, moviesById);

    return {
      programs,
      status: {
        theater: "nuart",
        available: true,
        message: null,
        sourceUrl: theater.url,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Nuart error";

    return {
      programs: [],
      status: {
        theater: "nuart",
        available: false,
        message: `${theater.name} data is temporarily unavailable. Please check the theater site. (${message})`,
        sourceUrl: theater.url,
      },
    };
  }
}
