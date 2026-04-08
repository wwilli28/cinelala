import { cacheLife, cacheTag } from "next/cache";

import { getTheater } from "@/lib/constants/theaters";
import { splitHtmlParagraphs, stripTags } from "@/lib/ingestion/html";
import {
  getBusinessDate,
  parseMonthDayYear,
  parseTimeTo24Hour,
} from "@/lib/ingestion/time";
import { ScreeningProgram, TheaterProgramsResult } from "@/lib/types/screenings";

const VISTA_SCHEDULE_URL = "https://www.vistatheaterhollywood.com/schedule/";

async function fetchVistaHtml(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Vista request failed with ${response.status}`);
  }

  return response.text();
}

function parseMovieLinks(scheduleHtml: string) {
  return Array.from(
    scheduleHtml.matchAll(/<a href="(https:\/\/www\.vistatheaterhollywood\.com\/movies\/[^"]+)"/g)
  )
    .map((match) => match[1])
    .filter((link) => !link.includes("#"));
}

function parseMovieTitle(html: string) {
  return stripTags(
    html.match(/<h1 class="entry__movie--title[^"]*">([\s\S]*?)<\/h1>/)?.[1] ?? ""
  );
}

function parseDetailsLine(html: string) {
  return stripTags(
    html.match(/<p class="text__size-4 entry__movie--details">([\s\S]*?)<\/p>/)?.[1] ??
      ""
  );
}

function parseSummary(html: string) {
  const summaryHtml =
    html.match(/<div class="entry__movie--summary">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const paragraphs = splitHtmlParagraphs(summaryHtml);

  return paragraphs.join("\n\n") || null;
}

function parseDirector(html: string) {
  const directorHtml =
    html.match(/<div class="entry__movie--directors">([\s\S]*?)<\/div>/)?.[1] ?? "";

  return stripTags(directorHtml) || null;
}

function parsePosterUrl(html: string) {
  const imageTag = html.match(
    /<img [^>]*class="entry__movie--poster"[^>]*>/)?.[0];

  if (!imageTag) {
    return null;
  }

  return imageTag.match(/src="([^"]+)"/)?.[1] ?? null;
}

function parseYear(detailsLine: string) {
  return detailsLine.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;
}

function parseRuntime(detailsLine: string) {
  const match = detailsLine.match(/(\d+)h\s+(\d+)m/);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

function parseFormat(detailsLine: string) {
  const parts = detailsLine.split("·").map((part) => part.trim());
  return parts.at(-1) ?? null;
}

function parseShowtimeGroups(html: string) {
  const section =
    html.match(
      /<div class="entry__movie--showtimes">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="entry__movie--columns/
    )?.[1] ??
    "";

  return Array.from(
    section.matchAll(
      /<div class="entry__movie--dates">\s*<p class='text__size-4'>([\s\S]*?)<\/p>\s*<div class="entry__movie--times">([\s\S]*?)<\/div>/g
    )
  ).map((match) => {
    const dateLabel = stripTags(match[1]).replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const date = parseMonthDayYear(dateLabel.replace(",", ""));
    const showtimes = Array.from(
      match[2].matchAll(
        /<a href="([^"]*)" class="([^"]*)"[^>]*>\s*([^<]+?)\s*(?:<span>\(Sold Out\)<\/span>)?\s*<\/a>/g
      )
    ).map((timeMatch) => ({
      ticketUrl: timeMatch[1] || null,
      soldOut: timeMatch[2].includes("sold-out"),
      time: parseTimeTo24Hour(stripTags(timeMatch[3])) ?? "",
    }));

    return {
      date,
      showtimes: showtimes.filter((showtime) => Boolean(showtime.time)),
    };
  });
}

async function parseVistaMoviePage(url: string) {
  const html = await fetchVistaHtml(url);
  const title = parseMovieTitle(html);
  const detailsLine = parseDetailsLine(html);
  const summary = parseSummary(html);
  const director = parseDirector(html);
  const posterUrl = parsePosterUrl(html);
  const year = parseYear(detailsLine);
  const runtimeMinutes = parseRuntime(detailsLine);
  const format = parseFormat(detailsLine);

  return parseShowtimeGroups(html).map(({ date, showtimes }) => {
    const startTime = showtimes[0]?.time ?? null;

    return {
      id: `${url.replace(/^https?:\/\//, "").replace(/\/+$/, "")}::${date}`,
      theater: "vista" as const,
      sourceUrl: url,
      ticketUrl: showtimes[0]?.ticketUrl ?? null,
      date,
      displayDate: getBusinessDate(date, startTime),
      startTime,
      title: null,
      films: [
        {
          id: `${url.replace(/^https?:\/\//, "").replace(/\/+$/, "")}::film::${date}`,
          title,
          startTime,
          sourceEnrichment: {
            posterUrl,
            overview: summary,
            releaseDate: year ? `${year}-01-01` : null,
            runtimeMinutes,
            format,
            director,
          },
          tmdb: null,
        },
      ],
      showtimes,
      format,
      specialGuests: [],
      notes: null,
      sourceImageUrl: posterUrl,
    } satisfies ScreeningProgram;
  });
}

export async function getVistaPrograms(): Promise<TheaterProgramsResult> {
  "use cache";

  cacheLife({
    stale: 60 * 30,
    revalidate: 60 * 60 * 6,
    expire: 60 * 60 * 24,
  });
  cacheTag("screenings:vista");

  const theater = getTheater("vista");

  if (!theater) {
    throw new Error("Missing Vista theater definition");
  }

  try {
    const scheduleHtml = await fetchVistaHtml(VISTA_SCHEDULE_URL);
    const movieLinks = Array.from(new Set(parseMovieLinks(scheduleHtml)));
    const groupedPrograms = await Promise.all(
      movieLinks.map((link) => parseVistaMoviePage(link))
    );

    return {
      programs: groupedPrograms.flat(),
      status: {
        theater: "vista",
        available: true,
        message: null,
        sourceUrl: theater.url,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Vista error";

    return {
      programs: [],
      status: {
        theater: "vista",
        available: false,
        message: `${theater.name} data is temporarily unavailable. Please check the theater site. (${message})`,
        sourceUrl: theater.url,
      },
    };
  }
}
