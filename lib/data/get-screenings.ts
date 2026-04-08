import { screenings as legacyScreenings } from "@/app/lib/screenings";
import { theaters } from "@/lib/constants/theaters";
import { compareProgramStarts, isProgramUpcoming } from "@/lib/ingestion/time";
import {
  getAeroPrograms,
  getEgyptianPrograms,
} from "@/lib/theaters/american-cinematheque";
import { getAcademyPrograms } from "@/lib/theaters/academy";
import { getNewBeverlyPrograms } from "@/lib/theaters/new-beverly";
import { getNuartPrograms } from "@/lib/theaters/nuart";
import { getVistaPrograms } from "@/lib/theaters/vista";
import {
  ProgramFilm,
  ScreeningProgram,
  TheaterSourceStatus,
} from "@/lib/types/screenings";

function mapLegacyFilm(id: string, screening: (typeof legacyScreenings)[number]): ProgramFilm {
  const format = screening.format ?? null;
  const releaseDate = screening.year ? `${screening.year}-01-01` : null;

  return {
    id,
    title: screening.title,
    startTime: screening.time
      ? screening.time
          .replace(" PM", " pm")
          .replace(" AM", " am")
          .replace(/^(\d{1,2}:\d{2})\s([ap]m)$/i, (_, time, suffix) => {
            const [hoursText, minutes] = time.split(":");
            let hours = Number.parseInt(hoursText, 10);

            if (hours === 12) {
              hours = 0;
            }

            if (suffix.toLowerCase() === "pm") {
              hours += 12;
            }

            return `${String(hours).padStart(2, "0")}:${minutes}`;
          })
      : null,
    sourceEnrichment: {
      posterUrl: screening.poster,
      overview: null,
      releaseDate,
      runtimeMinutes: null,
      format,
      director: screening.director ?? null,
    },
    tmdb: null,
  };
}

function getLegacyPrograms() {
  return legacyScreenings
    .filter(
      (screening) =>
        screening.theater !== "The New Beverly" &&
        screening.theater !== "The Aero" &&
        screening.theater !== "The Egyptian" &&
        screening.theater !== "The Vista" &&
        screening.theater !== "Nuart" &&
        screening.theater !== "The Academy Theater"
    )
    .map((screening, index) => {
      const theater = theaters.find((item) => item.name === screening.theater);
      const programId = `legacy-${index}`;

      return {
        id: programId,
        theater: theater?.slug ?? "vista",
        sourceUrl: theater?.url ?? "#",
        ticketUrl: screening.tickets,
        date: screening.date,
        displayDate: screening.date,
        startTime: mapLegacyFilm(`${programId}-film`, screening).startTime,
        title: null,
        films: [mapLegacyFilm(`${programId}-film`, screening)],
        showtimes: mapLegacyFilm(`${programId}-film`, screening).startTime
          ? [
              {
                time: mapLegacyFilm(`${programId}-film`, screening).startTime ?? "",
                ticketUrl: screening.tickets,
                soldOut: false,
              },
            ]
          : [],
        format: screening.format ?? null,
        specialGuests: screening.specialGuest ? [screening.specialGuest] : [],
        notes: null,
        sourceImageUrl: screening.poster,
      } satisfies ScreeningProgram;
    });
}

export async function getHomepagePrograms() {
  const [newBeverly, aero, egyptian, vista, nuart, academy] = await Promise.all([
    getNewBeverlyPrograms(),
    getAeroPrograms(),
    getEgyptianPrograms(),
    getVistaPrograms(),
    getNuartPrograms(),
    getAcademyPrograms(),
  ]);
  const legacyPrograms = getLegacyPrograms();
  const now = new Date();
  const programs = [
    ...newBeverly.programs,
    ...aero.programs,
    ...egyptian.programs,
    ...vista.programs,
    ...nuart.programs,
    ...academy.programs,
    ...legacyPrograms,
  ]
    .filter((program) => isProgramUpcoming(program.date, now))
    .sort((first, second) =>
      compareProgramStarts(
        first.date,
        first.startTime,
        second.date,
        second.startTime
      )
    );

  return {
    programs,
    statuses: [
      newBeverly.status,
      aero.status,
      egyptian.status,
      vista.status,
      nuart.status,
      academy.status,
    ].filter((status): status is TheaterSourceStatus => Boolean(status)),
  };
}
