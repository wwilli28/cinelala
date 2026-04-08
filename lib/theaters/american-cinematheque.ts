import { cacheLife, cacheTag } from "next/cache";

import { getTheater } from "@/lib/constants/theaters";
import { splitHtmlParagraphs, stripTags } from "@/lib/ingestion/html";
import {
  getBusinessDate,
  parseMonthDayYear,
  parseTimeTo24Hour,
} from "@/lib/ingestion/time";
import {
  ScreeningProgram,
  TheaterProgramsResult,
  TheaterSlug,
} from "@/lib/types/screenings";

const AMERICAN_CINEMATHEQUE_API =
  "https://www.americancinematheque.com/wp-json/wp/v2/event";

const LOCATION_IDS: Record<"aero" | "egyptian", number> = {
  aero: 54,
  egyptian: 55,
};

interface AmericanCinemathequeEvent {
  id: number;
  link: string;
  title: {
    rendered: string;
  };
  acf?: {
    event_details?: {
      director?: string;
      release_year?: string;
      runtime?: string;
    };
    event_hero?: {
      dates?: string;
      times?: string;
      hero_title?: string;
      intro_text?: string;
      image_url?: string;
      cta_link?: string;
      cta_type?: string;
    };
    event_main_section?: {
      main_body_text?: string;
    };
    event_card_image?: {
      url?: string;
    };
  };
}

async function fetchAmericanCinemathequeEvents(locationId: number) {
  const response = await fetch(
    `${AMERICAN_CINEMATHEQUE_API}?per_page=100&event_location=${locationId}`,
    {
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `American Cinematheque request failed with ${response.status}`
    );
  }

  return (await response.json()) as AmericanCinemathequeEvent[];
}

function normalizeHeroDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)\b\s*/i, "")
    .replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\b/gi, (month) => {
      const months: Record<string, string> = {
        JAN: "January",
        FEB: "February",
        MAR: "March",
        APR: "April",
        MAY: "May",
        JUN: "June",
        JUL: "July",
        AUG: "August",
        SEP: "September",
        SEPT: "September",
        OCT: "October",
        NOV: "November",
        DEC: "December",
      };

      return months[month.toUpperCase()] ?? month;
    })
    .replace(/\s+/g, " ")
    .trim();

  return parseMonthDayYear(cleaned);
}

function normalizeHeroTime(value: string | undefined) {
  if (!value) {
    return null;
  }

  const firstTime = value
    .split("/")
    .map((part) => part.trim())
    .find(Boolean);

  return firstTime ? parseTimeTo24Hour(firstTime) : null;
}

function extractFormat(mainBodyText: string | undefined) {
  if (!mainBodyText) {
    return null;
  }

  const paragraphs = splitHtmlParagraphs(mainBodyText);
  const formatLine = paragraphs.find((paragraph) =>
    paragraph.toUpperCase().startsWith("FORMAT:")
  );

  if (!formatLine) {
    return null;
  }

  return formatLine.replace(/^FORMAT:\s*/i, "").trim() || null;
}

function extractNotes(mainBodyText: string | undefined, introText: string | undefined) {
  const introParagraphs = splitHtmlParagraphs(introText ?? "");
  const mainParagraphs = splitHtmlParagraphs(mainBodyText ?? "");
  const aboutIndex = mainParagraphs.findIndex((paragraph) =>
    /^ABOUT THE FILM:/i.test(paragraph)
  );
  const contentParagraphs =
    aboutIndex >= 0 ? mainParagraphs.slice(aboutIndex + 1) : mainParagraphs;
  const noteParagraphs = [...introParagraphs, ...contentParagraphs].filter(
    (paragraph) =>
      paragraph &&
      !/^FORMAT:/i.test(paragraph) &&
      !/^DISTRIBUTOR:/i.test(paragraph) &&
      !/^COUNTRY:/i.test(paragraph)
  );

  return noteParagraphs.join("\n\n") || null;
}

function extractOverview(mainBodyText: string | undefined) {
  const paragraphs = splitHtmlParagraphs(mainBodyText ?? "");
  const aboutIndex = paragraphs.findIndex((paragraph) =>
    /^ABOUT THE FILM:/i.test(paragraph)
  );

  if (aboutIndex >= 0) {
    return paragraphs[aboutIndex + 1] ?? null;
  }

  return paragraphs[0] ?? null;
}

function extractSpecialGuests(introText: string | undefined) {
  return splitHtmlParagraphs(introText ?? "")
    .filter((paragraph) => /q&a|guest|discussion|introduction/i.test(paragraph))
    .map((paragraph) => paragraph.replace(/^[^|]*\|\s*/, "").trim());
}

function mapEventToProgram(
  event: AmericanCinemathequeEvent,
  theater: TheaterSlug
): ScreeningProgram | null {
  const hero = event.acf?.event_hero;
  const details = event.acf?.event_details;
  const mainSection = event.acf?.event_main_section;
  const date = normalizeHeroDate(hero?.dates);
  const startTime = normalizeHeroTime(hero?.times);

  if (!date) {
    return null;
  }

  const title = stripTags(hero?.hero_title ?? event.title.rendered).trim();
  const programNotes = extractNotes(mainSection?.main_body_text, hero?.intro_text);

  return {
    id: `americancinematheque-${event.id}`,
    theater,
    sourceUrl: event.link,
    ticketUrl: hero?.cta_link || null,
    date,
    displayDate: getBusinessDate(date, startTime),
    startTime,
    title: null,
    films: [
      {
        id: `americancinematheque-${event.id}-film`,
        title,
        startTime,
        sourceEnrichment: {
          posterUrl:
            event.acf?.event_card_image?.url ??
            hero?.image_url ??
            null,
          overview: extractOverview(mainSection?.main_body_text),
          releaseDate: details?.release_year
            ? `${details.release_year}-01-01`
            : null,
          runtimeMinutes: details?.runtime
            ? Number.parseInt(details.runtime, 10)
            : null,
          format: extractFormat(mainSection?.main_body_text),
          director: details?.director?.trim() || null,
        },
        tmdb: null,
      },
    ],
    showtimes: startTime
      ? [
          {
            time: startTime,
            ticketUrl: hero?.cta_link || null,
            soldOut: false,
          },
        ]
      : [],
    format: extractFormat(mainSection?.main_body_text),
    specialGuests: extractSpecialGuests(hero?.intro_text),
    notes: programNotes,
    sourceImageUrl: hero?.image_url ?? event.acf?.event_card_image?.url ?? null,
  };
}

async function getProgramsForTheater(
  theater: "aero" | "egyptian"
): Promise<TheaterProgramsResult> {
  "use cache";

  cacheLife({
    stale: 60 * 30,
    revalidate: 60 * 60 * 6,
    expire: 60 * 60 * 24,
  });
  cacheTag(`screenings:${theater}`);

  const theaterDefinition = getTheater(theater);

  if (!theaterDefinition) {
    throw new Error(`Missing theater definition for ${theater}`);
  }

  try {
    const events = await fetchAmericanCinemathequeEvents(LOCATION_IDS[theater]);
    const programs = events
      .map((event) => mapEventToProgram(event, theater))
      .filter((program): program is ScreeningProgram => program !== null);

    return {
      programs,
      status: {
        theater,
        available: true,
        message: null,
        sourceUrl: theaterDefinition.url,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Cinematheque error";

    return {
      programs: [],
      status: {
        theater,
        available: false,
        message: `${theaterDefinition.name} data is temporarily unavailable. Please check the theater site. (${message})`,
        sourceUrl: theaterDefinition.url,
      },
    };
  }
}

export async function getAeroPrograms() {
  return getProgramsForTheater("aero");
}

export async function getEgyptianPrograms() {
  return getProgramsForTheater("egyptian");
}
