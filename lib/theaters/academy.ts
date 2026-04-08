import { cacheLife, cacheTag } from "next/cache";

import { getTheater } from "@/lib/constants/theaters";
import { fetchHtml, stripTags } from "@/lib/ingestion/html";
import { getBusinessDate } from "@/lib/ingestion/time";
import { ScreeningProgram, TheaterProgramsResult } from "@/lib/types/screenings";

const ACADEMY_CALENDAR_URL =
  "https://www.academymuseum.org/en/calendar?programTypes=16i3uOYQwism7sMDhIQr2O";
const ACADEMY_SCREENINGS_PROGRAM_TYPE_ID = "16i3uOYQwism7sMDhIQr2O";
const ACADEMY_PROGRAM_URL_PREFIX =
  "https://www.academymuseum.org/en/programs/detail/";
const ACADEMY_TICKETING_API_URL =
  "https://tickets.academymuseum.org/cached_api/events/available/";

interface ContentfulRichTextNode {
  nodeType?: string;
  value?: string;
  content?: ContentfulRichTextNode[];
}

interface ContentfulRichTextDocument {
  json?: ContentfulRichTextNode | null;
  html?: string | null;
}

interface AcademyProgramEvent {
  sys?: {
    id?: string;
  };
  title?: ContentfulRichTextDocument | null;
  programTitle?: ContentfulRichTextDocument | null;
  specialGuest?: ContentfulRichTextDocument | null;
  programTagline?: ContentfulRichTextDocument | null;
  content?: ContentfulRichTextDocument | null;
  filmDescription1?: ContentfulRichTextDocument | null;
  filmDescription2?: ContentfulRichTextDocument | null;
  filmMetadata1?: ContentfulRichTextDocument | null;
  filmMetadata2?: ContentfulRichTextDocument | null;
  filmFormat1?: string | null;
  filmFormat2?: string | null;
  activeStartDate?: string | null;
  activeEndDate?: string | null;
  hideFromCalendar?: boolean | null;
  slug?: string | null;
  type?: string | null;
  image?: {
    url?: string | null;
  } | null;
  metadata?: {
    description?: string | null;
  } | null;
  ticketureId?: string | null;
  ticketureIdProduction?: string | null;
  noTicketsMessage?: string | null;
  nonTicketedProgram?: boolean | null;
  sponsorshipCredit?: ContentfulRichTextDocument | null;
  programTypesCollection?: {
    items?: Array<{
      sys?: {
        id?: string;
      };
      name?: string | null;
    }>;
  } | null;
}

interface AcademyCalendarPageData {
  props?: {
    pageProps?: {
      cfProgramsKeyedByTkId?: Record<string, AcademyProgramEvent>;
    };
  };
}

interface AcademyTicketingAvailableResponse {
  event_session?: {
    _data?: Array<{
      event_template_id?: string;
      id?: string;
      sold_out?: boolean;
      start_datetime?: string;
    }>;
  };
}

function getRichTextParagraphs(value: ContentfulRichTextDocument | null | undefined) {
  const document = value?.json;

  if (!document?.content) {
    return [];
  }

  return document.content
    .map((node) => flattenRichTextNode(node).trim())
    .filter(Boolean);
}

function flattenRichTextNode(node: ContentfulRichTextNode | null | undefined): string {
  if (!node) {
    return "";
  }

  if (node.nodeType === "text") {
    return node.value ?? "";
  }

  const children = (node.content ?? [])
    .map((child) => flattenRichTextNode(child))
    .join("");

  if (
    node.nodeType === "paragraph" ||
    node.nodeType?.startsWith("heading-") ||
    node.nodeType === "document"
  ) {
    return children;
  }

  if (node.nodeType === "hyperlink") {
    return children;
  }

  return children;
}

function extractNextDataJson(html: string) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );

  if (!match) {
    throw new Error("Unable to find Academy __NEXT_DATA__ payload");
  }

  return JSON.parse(match[1]) as AcademyCalendarPageData;
}

function htmlToText(value: ContentfulRichTextDocument | null | undefined) {
  if (value?.html) {
    return stripTags(value.html);
  }

  return getRichTextParagraphs(value).join("\n\n") || null;
}

function getProgramTitle(program: AcademyProgramEvent) {
  return (
    htmlToText(program.programTitle) ??
    htmlToText(program.title) ??
    "Untitled Academy screening"
  );
}

function getProgramDate(program: AcademyProgramEvent) {
  return program.activeStartDate?.slice(0, 10) ?? null;
}

function extractMetadataParagraphs(value: ContentfulRichTextDocument | null | undefined) {
  return getRichTextParagraphs(value).map((paragraph) =>
    paragraph.replace(/\s+/g, " ").trim()
  );
}

function extractReleaseDate(paragraphs: string[]) {
  const year = paragraphs.join(" ").match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? `${year}-01-01` : null;
}

function extractRuntimeMinutes(paragraphs: string[]) {
  const match = paragraphs.join(" ").match(/\b(\d+)\s*min\./i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function extractDirector(paragraphs: string[]) {
  const line = paragraphs.find((paragraph) => /^DIRECTED BY:/i.test(paragraph));
  return line?.replace(/^DIRECTED BY:\s*/i, "").trim() || null;
}

function extractMetadataNotes(paragraphs: string[]) {
  return paragraphs
    .filter(
      (paragraph) =>
        !/^\d{4}\s*\|/i.test(paragraph) &&
        !/^DIRECTED BY:/i.test(paragraph) &&
        !/^WRITTEN BY:/i.test(paragraph) &&
        !/^WITH:/i.test(paragraph)
    )
    .join("\n\n") || null;
}

function extractFilmSectionHeading(
  value: ContentfulRichTextDocument | null | undefined
) {
  const document = value?.json;

  if (!document?.content) {
    return null;
  }

  for (const node of document.content) {
    if (node.nodeType?.startsWith("heading-")) {
      const text = flattenRichTextNode(node).trim();
      if (text) {
        return text;
      }
    }
  }

  return null;
}

function cleanFilmTitle(title: string, format: string | null) {
  let cleaned = title.replace(/\s+/g, " ").trim();

  if (format) {
    const escapedFormat = format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(
      new RegExp(`\\s+in\\s+${escapedFormat}\\s*$`, "i"),
      ""
    );
  }

  return cleaned.trim();
}

function getFilmTitle(
  programTitle: string,
  description: ContentfulRichTextDocument | null | undefined,
  format: string | null,
  fallbackIndex: number
) {
  const heading = extractFilmSectionHeading(description);

  if (heading) {
    return cleanFilmTitle(heading, format);
  }

  if (fallbackIndex === 0) {
    return cleanFilmTitle(programTitle, format);
  }

  return `Film ${fallbackIndex + 1}`;
}

function getUniqueParagraphs(value: ContentfulRichTextDocument | null | undefined) {
  return getRichTextParagraphs(value).filter(
    (paragraph, index, paragraphs) => paragraphs.indexOf(paragraph) === index
  );
}

function getAcademyBusinessStartIso(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const laDate = formatter.format(now);

  return `${laDate}T07:00:00.000Z`;
}

function toLocalTimeString(isoDatetime: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter.format(new Date(isoDatetime));
}

async function fetchAcademyTicketingSessions(ticketureIds: string[]) {
  const sessionsByProgram = new Map<
    string,
    Array<{ soldOut: boolean; time: string }>
  >();

  if (ticketureIds.length === 0) {
    return sessionsByProgram;
  }

  const businessStartIso = getAcademyBusinessStartIso();
  const chunkSize = 25;

  for (let index = 0; index < ticketureIds.length; index += chunkSize) {
    const chunk = ticketureIds.slice(index, index + chunkSize);
    const url = new URL(ACADEMY_TICKETING_API_URL);
    url.searchParams.set("id._in", chunk.join(","));
    url.searchParams.set("event_session.start_datetime._gte", businessStartIso);
    url.searchParams.set("_embed", "venue,event_session,ticket_group,ticket_type");
    url.searchParams.set("ticket_group.hidden_type._prefix", "public");

    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Academy ticketing request failed with ${response.status}`);
    }

    const data = (await response.json()) as AcademyTicketingAvailableResponse;
    const sessions = data.event_session?._data ?? [];

    for (const session of sessions) {
      if (!session.event_template_id || !session.start_datetime) {
        continue;
      }

      const currentSessions = sessionsByProgram.get(session.event_template_id) ?? [];
      currentSessions.push({
        soldOut: Boolean(session.sold_out),
        time: toLocalTimeString(session.start_datetime),
      });
      sessionsByProgram.set(session.event_template_id, currentSessions);
    }
  }

  for (const [programId, sessions] of sessionsByProgram) {
    sessions.sort((first, second) => first.time.localeCompare(second.time));
    sessionsByProgram.set(
      programId,
      sessions.filter(
        (session, index, allSessions) =>
          allSessions.findIndex(
            (candidate) =>
              candidate.time === session.time &&
              candidate.soldOut === session.soldOut
          ) === index
      )
    );
  }

  return sessionsByProgram;
}

function mapAcademyProgram(
  program: AcademyProgramEvent,
  sessionsByProgram: Map<string, Array<{ soldOut: boolean; time: string }>>
): ScreeningProgram | null {
  const id = program.sys?.id;
  const slug = program.slug;
  const date = getProgramDate(program);

  if (!id || !slug || !date || program.hideFromCalendar) {
    return null;
  }

  const programTypeIds =
    program.programTypesCollection?.items?.map((item) => item.sys?.id).filter(Boolean) ??
    [];

  if (!programTypeIds.includes(ACADEMY_SCREENINGS_PROGRAM_TYPE_ID)) {
    return null;
  }

  const programTitle = getProgramTitle(program);
  const sourceUrl = `${ACADEMY_PROGRAM_URL_PREFIX}${slug}`;
  const showtimes = (sessionsByProgram.get(program.ticketureIdProduction ?? id) ?? []).map(
    (session) => ({
      ticketUrl: sourceUrl,
      soldOut: session.soldOut,
      time: session.time,
    })
  );
  const startTime = showtimes[0]?.time ?? null;
  const filmInputs = [
    {
      description: program.filmDescription1,
      metadata: program.filmMetadata1,
      format: program.filmFormat1 ?? null,
    },
    {
      description: program.filmDescription2,
      metadata: program.filmMetadata2,
      format: program.filmFormat2 ?? null,
    },
  ].filter(
    (film) =>
      Boolean(film.description?.json) ||
      Boolean(film.metadata?.json) ||
      Boolean(film.format)
  );

  const films =
    filmInputs.length > 0
      ? filmInputs.map((film, index) => {
          const metadataParagraphs = extractMetadataParagraphs(film.metadata);
          const overview = htmlToText(film.description) ?? program.metadata?.description ?? null;

          return {
            id: `${id}-film-${index + 1}`,
            title: getFilmTitle(programTitle, film.description, film.format, index),
            startTime: null,
            sourceEnrichment: {
              posterUrl: program.image?.url ?? null,
              overview,
              releaseDate: extractReleaseDate(metadataParagraphs),
              runtimeMinutes: extractRuntimeMinutes(metadataParagraphs),
              format: film.format,
              director: extractDirector(metadataParagraphs),
            },
            tmdb: null,
          };
        })
      : [
          {
            id: `${id}-film-1`,
            title: programTitle,
            startTime: null,
            sourceEnrichment: {
              posterUrl: program.image?.url ?? null,
              overview: program.metadata?.description ?? null,
              releaseDate: null,
              runtimeMinutes: null,
              format: program.filmFormat1 ?? null,
              director: null,
            },
            tmdb: null,
          },
        ];

  const metadataNotes = filmInputs
    .map((film) => extractMetadataNotes(extractMetadataParagraphs(film.metadata)))
    .filter(Boolean) as string[];
  const specialGuestParagraphs = getUniqueParagraphs(program.specialGuest);
  const taglineParagraphs = getUniqueParagraphs(program.programTagline).filter(
    (paragraph) => !specialGuestParagraphs.includes(paragraph)
  );
  const programNotes = [
    ...metadataNotes,
    ...taglineParagraphs,
    htmlToText(program.content),
    htmlToText(program.sponsorshipCredit),
  ].filter(Boolean) as string[];

  return {
    id: `academy-${id}`,
    theater: "academy",
    sourceUrl,
    ticketUrl: sourceUrl,
    date,
    displayDate: getBusinessDate(date, startTime),
    startTime,
    title: programTitle,
    films,
    showtimes,
    format:
      films.length === 1 ? films[0].sourceEnrichment.format ?? null : null,
    specialGuests: specialGuestParagraphs,
    notes: programNotes.join("\n\n") || null,
    sourceImageUrl: program.image?.url ?? null,
  };
}

async function fetchAcademyPrograms() {
  const html = await fetchHtml(ACADEMY_CALENDAR_URL);
  const data = extractNextDataJson(html);
  const programs = Object.values(data.props?.pageProps?.cfProgramsKeyedByTkId ?? {});
  const ticketureIds = programs
    .map((program) => program.ticketureIdProduction ?? program.ticketureId ?? program.sys?.id)
    .filter((id): id is string => Boolean(id));
  const sessionsByProgram = await fetchAcademyTicketingSessions(ticketureIds);

  return programs.map((program) => mapAcademyProgram(program, sessionsByProgram));
}

export async function getAcademyPrograms(): Promise<TheaterProgramsResult> {
  "use cache";

  cacheLife({
    stale: 60 * 30,
    revalidate: 60 * 60 * 6,
    expire: 60 * 60 * 24,
  });
  cacheTag("screenings:academy");

  const theater = getTheater("academy");

  if (!theater) {
    throw new Error("Missing Academy theater definition");
  }

  try {
    const programs = (await fetchAcademyPrograms())
      .filter((program): program is ScreeningProgram => program !== null);

    return {
      programs,
      status: {
        theater: "academy",
        available: true,
        message: null,
        sourceUrl: theater.url,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Academy error";

    return {
      programs: [],
      status: {
        theater: "academy",
        available: false,
        message: `${theater.name} data is temporarily unavailable. Please check the theater site. (${message})`,
        sourceUrl: theater.url,
      },
    };
  }
}
