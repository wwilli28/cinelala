import { cacheLife, cacheTag } from "next/cache";

import { theaters } from "@/lib/constants/theaters";
import { enrichProgramFilm } from "@/lib/enrichment/tmdb";
import { fetchHtml, matchFirst, stripTags } from "@/lib/ingestion/html";
import {
  getBusinessDate,
  parseMonthDayYear,
  parseTimeTo24Hour,
} from "@/lib/ingestion/time";
import { newBeverlyProgramOverrides } from "@/lib/overrides/new-beverly";
import {
  ProgramFilm,
  ScreeningProgram,
  TheaterProgramsResult,
} from "@/lib/types/screenings";

const NEW_BEVERLY = theaters.find((theater) => theater.slug === "new-beverly");

if (!NEW_BEVERLY) {
  throw new Error("New Beverly definition is missing");
}

const NEW_BEVERLY_THEATER = NEW_BEVERLY;

const GENERIC_PROGRAM_TITLES = new Set([
  "double feature",
  "family matinee",
  "midnight",
]);

function makeProgramId(sourceUrl: string) {
  return sourceUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function getUniqueFormats(films: ProgramFilm[]) {
  const uniqueFormats = Array.from(
    new Set(
      films
        .map((film) => film.sourceEnrichment.format)
        .filter((format): format is string => Boolean(format))
    )
  );

  if (uniqueFormats.length === 0) {
    return null;
  }

  return uniqueFormats.join(" / ");
}

function parseDetailsMap(detailsHtml: string) {
  return new Map(
    Array.from(
      detailsHtml.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)
    ).map((match) => [stripTags(match[1]), stripTags(match[2])])
  );
}

function parseFilmBlocks(html: string) {
  const moviesSection = html.match(/<section class="movies">([\s\S]*?)<\/section>/);

  if (!moviesSection) {
    return [];
  }

  return moviesSection[1]
    .split('<div class="movie row-xl">')
    .slice(1)
    .map((chunk, index) => {
      const title = stripTags(
        matchFirst(chunk, /<h2 class="movie__title">([\s\S]*?)<\/h2>/) ?? ""
      );
      const posterUrl = matchFirst(
        chunk,
        /<figure class="movie__poster">\s*<img src="([^"]+)"/
      );
      const overview = stripTags(matchFirst(chunk, /<p>([\s\S]*?)<\/p>/) ?? "");
      const allParagraphs = Array.from(chunk.matchAll(/<p>([\s\S]*?)<\/p>/g)).map(
        (match) => stripTags(match[1])
      );
      const detailsMap = parseDetailsMap(
        matchFirst(chunk, /<div class="movie__details">([\s\S]*?)<\/div>/) ?? ""
      );
      const runningTimeText = detailsMap.get("Running Time") ?? null;
      const runtimeMinutes = runningTimeText
        ? Number.parseInt(runningTimeText, 10)
        : null;
      const year = detailsMap.get("Year") ?? null;

      return {
        id: `${index}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title,
        posterUrl,
        overview: overview || null,
        notes: allParagraphs.slice(1).join("\n\n") || null,
        releaseDate: year ? `${year}-01-01` : null,
        runtimeMinutes: Number.isNaN(runtimeMinutes) ? null : runtimeMinutes,
        format: detailsMap.get("Format") ?? null,
        director: detailsMap.get("Director") ?? null,
      };
    })
    .filter((film) => film.title);
}

function parseFilmShowtimes(html: string) {
  const mastSection = html.match(
    /<div class="movie-mast__titles">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/
  );

  if (!mastSection) {
    return [];
  }

  return Array.from(
    mastSection[1].matchAll(
      /<time class="movie-mast__times">\s*([^<]+?)\s*<\/time>\s*<h3 class="movie-mast__title">\s*([\s\S]*?)\s*<\/h3>/g
    )
  ).map((match) => ({
    startTime: parseTimeTo24Hour(stripTags(match[1])),
    title: stripTags(match[2]),
  }));
}

async function parseProgramPage(
  sourceUrl: string
): Promise<ScreeningProgram | null> {
  const html = await fetchHtml(sourceUrl);
  const dateText = stripTags(
    matchFirst(html, /<time class="movie-mast__dates">\s*([\s\S]*?)\s*<\/time>/) ??
      ""
  );

  if (!dateText) {
    throw new Error(`New Beverly program page is missing a date: ${sourceUrl}`);
  }

  const programId = makeProgramId(sourceUrl);
  const override = newBeverlyProgramOverrides[programId];

  if (override?.exclude) {
    return null;
  }

  const headerTitle = stripTags(
    matchFirst(html, /<h1 class="title__header">\s*([\s\S]*?)\s*<\/h1>/) ?? ""
  );
  const titleClass = matchFirst(html, /<header class="title ([^"]+)">/) ?? "";
  const normalizedHeader = headerTitle.toLowerCase();
  const filmShowtimes = parseFilmShowtimes(html);

  const baseFilms = parseFilmBlocks(html);
  const films = await Promise.all(
    baseFilms.map(async (film, index) => {
      const matchingShowtime = filmShowtimes[index];
      const overriddenTitle =
        override?.filmTitles?.[film.title.toLowerCase()] ?? film.title;

      return enrichProgramFilm({
        id: `${programId}::${film.id}`,
        title: overriddenTitle,
        startTime: matchingShowtime?.startTime ?? null,
        sourceEnrichment: {
          posterUrl: film.posterUrl,
          overview: film.overview,
          releaseDate: film.releaseDate,
          runtimeMinutes: film.runtimeMinutes,
          format: film.format,
          director: film.director,
        },
      });
    })
  );

  const programTitle =
    override?.preferredProgramTitle !== undefined
      ? override.preferredProgramTitle
      : override?.title !== undefined
        ? override.title
      : headerTitle && !GENERIC_PROGRAM_TITLES.has(normalizedHeader)
        ? headerTitle
        : null;

  const date = parseMonthDayYear(dateText);
  const displayDate = getBusinessDate(date, filmShowtimes[0]?.startTime ?? null);
  const specialGuests = Array.from(
    new Set(
      films
        .flatMap((film) =>
          (film.sourceEnrichment.overview ?? "")
            .split(/(?<=[.!?])\s+/)
            .filter((sentence) =>
              /q&a|guest|introduced by|introduction by|discussion with/i.test(
                sentence
              )
            )
        )
        .map((sentence) => sentence.trim())
        .filter(Boolean)
    )
  );
  const collectedNotes = baseFilms
    .map((film) => film.notes)
    .filter((note): note is string => Boolean(note));
  const programTypeNote = titleClass.includes("title--midnight")
    ? "Midnight show"
    : titleClass.includes("title--family-matinee")
      ? "Family matinee"
      : titleClass.includes("title--triple-feature")
        ? "Triple feature"
        : titleClass.includes("title--double-feature")
          ? "Double feature"
          : null;
  const notes = [programTypeNote, ...collectedNotes]
    .filter((note): note is string => Boolean(note))
    .join("\n\n");

  const ticketUrl = matchFirst(
    html,
    /<a class="movie-mast__cta btn btn--alpha" href="([^"]+)"/
  );

  return {
    id: programId,
    theater: "new-beverly",
    sourceUrl,
    ticketUrl,
    date,
    displayDate,
    startTime: filmShowtimes[0]?.startTime ?? null,
    title: programTitle,
    films,
    showtimes: filmShowtimes
      .filter((showtime) => Boolean(showtime.startTime))
      .map((showtime) => ({
        time: showtime.startTime ?? "",
        ticketUrl,
        soldOut: false,
      })),
    format: getUniqueFormats(films),
    specialGuests,
    notes: override?.notes !== undefined ? override.notes : notes || null,
    sourceImageUrl:
      matchFirst(html, /<meta property="og:image" content="([^"]*)"/) ?? null,
  };
}

function parseScheduleLinks(scheduleHtml: string) {
  return Array.from(
    scheduleHtml.matchAll(
      /<article class="event-card">\s*<a href="([^"]+)"/g
    )
  ).map((match) => match[1]);
}

export async function getNewBeverlyPrograms(): Promise<TheaterProgramsResult> {
  "use cache";

  cacheLife({
    stale: 60 * 30,
    revalidate: 60 * 60 * 6,
    expire: 60 * 60 * 24,
  });
  cacheTag("screenings:new-beverly");

  try {
    const scheduleHtml = await fetchHtml(NEW_BEVERLY_THEATER.url);
    const links = parseScheduleLinks(scheduleHtml);
    const uniqueLinks = Array.from(new Set(links));
    const programsWithNulls = await Promise.all(
      uniqueLinks.map((link) => parseProgramPage(link))
    );
    const programs = programsWithNulls.filter(
      (program): program is ScreeningProgram => program !== null
    );

    return {
      programs,
      status: {
        theater: "new-beverly",
        available: true,
        message: null,
        sourceUrl: NEW_BEVERLY_THEATER.url,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown New Beverly error";

    return {
      programs: [],
      status: {
        theater: "new-beverly",
        available: false,
        message: `New Beverly data is temporarily unavailable. Please check the theater site. (${message})`,
        sourceUrl: NEW_BEVERLY_THEATER.url,
      },
    };
  }
}
