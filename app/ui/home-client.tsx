"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { theaterAccentColors } from "@/lib/constants/theaters";
import {
  formatDateHeading,
  formatTimeForDisplay,
} from "@/lib/ingestion/time";
import {
  getFilmMetadataLine,
  getProgramHeading,
  getProgramPosterUrls,
} from "@/lib/presenters/programs";
import { quotes } from "@/lib/quotes";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  ScreeningProgram,
  TheaterDefinition,
  TheaterSourceStatus,
} from "@/lib/types/screenings";

interface HomeClientProps {
  programs: ScreeningProgram[];
  statuses: TheaterSourceStatus[];
  theaters: TheaterDefinition[];
  initialFavoriteFilmIds: string[];
  userEmail: string | null;
  supabaseConfigured: boolean;
}

interface CalendarDayCell {
  date: string | null;
  dayNumber: number | null;
}

const FAVORITES_STORAGE_KEY = "cine-lala-favorite-films";
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function pickRandomQuoteId(previousQuoteId?: string | null) {
  if (quotes.length === 0) {
    return null;
  }

  if (quotes.length === 1) {
    return quotes[0].id;
  }

  const eligibleQuotes = previousQuoteId
    ? quotes.filter((quote) => quote.id !== previousQuoteId)
    : quotes;
  const randomIndex = Math.floor(Math.random() * eligibleQuotes.length);

  return eligibleQuotes[randomIndex]?.id ?? quotes[0].id;
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1, 12));

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(date);
}

function getMonthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const leadingEmptyDays = firstDay.getUTCDay();
  const cells: CalendarDayCell[] = [];

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    cells.push({ date: null, dayNumber: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: `${monthKey}-${String(day).padStart(2, "0")}`,
      dayNumber: day,
    });
  }

  return cells;
}

function getCurrentLosAngelesMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return year && month ? `${year}-${month}` : null;
}

function getStoredFavoriteFilmIds() {
  if (typeof window === "undefined") {
    return [];
  }

  const storedFavorites = window.localStorage.getItem(FAVORITES_STORAGE_KEY);

  if (!storedFavorites) {
    return [];
  }

  try {
    const parsed = JSON.parse(storedFavorites);

    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    window.localStorage.removeItem(FAVORITES_STORAGE_KEY);
    return [];
  }
}

function StarButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      title={active ? "Remove from favorites" : "Add to favorites"}
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 text-white transition hover:border-amber-400 hover:text-amber-300"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={active ? "#D4AF37" : "none"}
        stroke={active ? "#D4AF37" : "currentColor"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3.75l2.546 5.16 5.694.828-4.12 4.016.973 5.671L12 16.747l-5.093 2.678.973-5.67-4.12-4.017 5.694-.828L12 3.75z" />
      </svg>
    </button>
  );
}

function HeaderCalendar({
  defaultMonth,
  availableMonths,
  availableDates,
  selectedDate,
  onSelectDate,
}: {
  defaultMonth: string;
  availableMonths: string[];
  availableDates: Set<string>;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null);
  const selectedDateMonth = selectedDate?.slice(0, 7) ?? null;

  const activeCalendarMonth =
    selectedDateMonth && availableMonths.includes(selectedDateMonth)
      ? selectedDateMonth
      : calendarMonth && availableMonths.includes(calendarMonth)
        ? calendarMonth
        : defaultMonth;

  const monthDays = getMonthDays(activeCalendarMonth);
  const monthIndex = availableMonths.indexOf(activeCalendarMonth);
  const previousMonth =
    monthIndex > 0 ? availableMonths[monthIndex - 1] : null;
  const nextMonth =
    monthIndex >= 0 && monthIndex < availableMonths.length - 1
      ? availableMonths[monthIndex + 1]
      : null;

  return (
    <div className="absolute right-0 top-0 hidden w-64 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 md:block">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (!previousMonth) {
              return;
            }

            onSelectDate(null);
            setCalendarMonth(previousMonth);
          }}
          disabled={!previousMonth}
          className="h-8 w-8 rounded-full text-zinc-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-500">
          {getMonthLabel(activeCalendarMonth)}
        </p>
        <button
          type="button"
          onClick={() => {
            if (!nextMonth) {
              return;
            }

            onSelectDate(null);
            setCalendarMonth(nextMonth);
          }}
          disabled={!nextMonth}
          className="h-8 w-8 rounded-full text-zinc-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-center">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={`${activeCalendarMonth}-${label}-${index}`}
            className="text-[11px] font-medium tracking-[0.18em] text-zinc-400"
          >
            {label}
          </div>
        ))}
        {monthDays.map((cell, index) =>
          cell.date && cell.dayNumber ? (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(selectedDate === cell.date ? null : cell.date)}
              disabled={!availableDates.has(cell.date)}
              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm transition ${
                selectedDate === cell.date
                  ? "bg-white text-black"
                  : availableDates.has(cell.date)
                    ? "text-white hover:bg-zinc-800"
                    : "text-zinc-700"
              }`}
              aria-label={`Show films for ${cell.date}`}
            >
              {cell.dayNumber}
            </button>
          ) : (
            <div key={`${activeCalendarMonth}-empty-${index}`} className="h-7 w-7" />
          )
        )}
      </div>
    </div>
  );
}

export default function HomeClient({
  programs,
  statuses,
  theaters,
  initialFavoriteFilmIds,
  userEmail,
  supabaseConfigured,
}: HomeClientProps) {
  const router = useRouter();
  const [selectedTheaters, setSelectedTheaters] = useState<string[]>([]);
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(() =>
    pickRandomQuoteId()
  );
  const [favoriteFilmIds, setFavoriteFilmIds] = useState<string[]>(
    userEmail ? initialFavoriteFilmIds : getStoredFavoriteFilmIds
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const currentQuote =
    quotes.find((quote) => quote.id === currentQuoteId) ?? quotes[0] ?? null;

  function rotateQuote() {
    setCurrentQuoteId((current) => pickRandomQuoteId(current));
  }

  function updateFavoriteFilmIds(next: string[]) {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  async function toggleFavoriteFilm(filmId: string) {
    const current = favoriteFilmIds;
    const nextFavorites = current.includes(filmId)
      ? current.filter((id) => id !== filmId)
      : [...current, filmId];

    setFavoriteError(null);

    if (!userEmail || !supabaseConfigured) {
      setFavoriteFilmIds(updateFavoriteFilmIds(nextFavorites));
      return;
    }

    setFavoriteFilmIds(nextFavorites);

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setFavoriteError("Favorites sync is not configured yet.");
      setFavoriteFilmIds(current);
      return;
    }

    const response = current.includes(filmId)
      ? await supabase.from("favorites").delete().eq("film_id", filmId)
      : await supabase.from("favorites").insert({ film_id: filmId });

    if (response.error) {
      setFavoriteError(response.error.message);
      setFavoriteFilmIds(current);
    }
  }

  function isFavoriteFilm(filmId: string) {
    return favoriteFilmIds.includes(filmId);
  }

  function toggleTheater(theaterName: string) {
    if (theaterName === "All Theaters") {
      setSelectedTheaters([]);
      rotateQuote();
      return;
    }

    setSelectedTheaters((current) =>
      current.includes(theaterName)
        ? current.filter((name) => name !== theaterName)
        : [...current, theaterName]
    );
    rotateQuote();
  }

  const filteredPrograms = useMemo(
    () =>
      programs.filter((program) => {
        const matchesTheater =
          selectedTheaters.length === 0 ||
          selectedTheaters.includes(
            theaters.find((theater) => theater.slug === program.theater)?.name ?? ""
          );
        const matchesFavorites =
          !showFavoritesOnly ||
          program.films.some((film) => favoriteFilmIds.includes(film.id));

        return matchesTheater && matchesFavorites;
      }),
    [favoriteFilmIds, programs, selectedTheaters, showFavoritesOnly, theaters]
  );
  const dateFilteredPrograms = useMemo(
    () =>
      selectedDate
        ? filteredPrograms.filter((program) => program.date === selectedDate)
        : filteredPrograms,
    [filteredPrograms, selectedDate]
  );

  const groupedPrograms = useMemo(
    () => {
      if (selectedDate) {
        return dateFilteredPrograms.length > 0
          ? [[selectedDate, dateFilteredPrograms] satisfies [string, ScreeningProgram[]]]
          : [];
      }

      return Object.entries(
        dateFilteredPrograms.reduce(
          (groups, program) => {
            if (!groups[program.displayDate]) {
              groups[program.displayDate] = [];
            }

            groups[program.displayDate].push(program);
            return groups;
          },
          {} as Record<string, ScreeningProgram[]>
        )
      );
    },
    [dateFilteredPrograms, selectedDate]
  );
  const allAvailableMonths = useMemo(
    () =>
      Array.from(new Set(programs.map((program) => program.date.slice(0, 7)))).sort(),
    [programs]
  );
  const currentMonth = getCurrentLosAngelesMonthKey();
  const defaultVisibleMonth =
    groupedPrograms[0]?.[0].slice(0, 7) ?? allAvailableMonths[0] ?? null;
  const calendarDefaultMonth =
    currentMonth && allAvailableMonths.includes(currentMonth)
      ? currentMonth
      : defaultVisibleMonth;
  const availableDates = new Set(filteredPrograms.map((program) => program.date));

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    setAuthPending(true);
    await supabase.auth.signOut();
    setAuthPending(false);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <div className="relative flex min-h-[18rem] items-start justify-center md:min-h-[20rem]">
            {currentQuote ? (
              <div className="quote-intro absolute left-0 top-6 hidden max-w-xs md:block">
                <p className="quote-intro-text font-serif text-2xl italic leading-tight text-amber-400">
                  &ldquo;{currentQuote.quote}&rdquo;
                </p>
                <p className="quote-intro-credit mt-3 font-serif text-base italic text-amber-400/90">
                  {currentQuote.name}
                </p>
              </div>
            ) : null}
            <div className="flex items-center justify-center">
              <Image
                src="/logos/la-showtimes-logo.png"
                alt="LA Showtimes"
                width={420}
                height={420}
                className="h-auto w-auto max-h-64 max-w-full object-contain md:max-h-72"
              />
            </div>
            {calendarDefaultMonth ? (
              <HeaderCalendar
                key={calendarDefaultMonth}
                defaultMonth={calendarDefaultMonth}
                availableMonths={allAvailableMonths}
                availableDates={availableDates}
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  rotateQuote();
                  setSelectedDate(date);
                }}
              />
            ) : null}
          </div>
        </header>

        {statuses
          .filter((status) => !status.available)
          .map((status) => {
            const theater = theaters.find(
              (candidate) => candidate.slug === status.theater
            );

            return (
              <div
                key={status.theater}
                className="mb-6 rounded-2xl border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-100"
              >
                <p className="font-semibold">
                  {theater?.name ?? status.theater} source unavailable
                </p>
                <p>{status.message}</p>
              </div>
            );
          })}

        <section className="mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
            {supabaseConfigured ? (
              userEmail ? (
                <>
                  <p className="text-sm text-zinc-400">{userEmail}</p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={authPending}
                    className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-white transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authPending ? "Signing out..." : "Log out"}
                  </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-white transition hover:border-zinc-500"
                >
                  Log in to save My Favs
                </Link>
              )
            ) : null}
          </div>
          <p className="mb-4 text-center font-serif text-lg italic text-amber-400">
            Classic and repertory screenings across Los Angeles
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {[
              { name: "All Theaters", logo: "/logos/all-theaters-new.png" },
              ...theaters,
              { name: "My Favs", logo: "/logos/my-favs.png" },
            ].map((theater) => {
              const accentColor =
                "slug" in theater
                  ? theaterAccentColors[theater.slug]
                  : theater.name === "My Favs"
                    ? "#D4AF37"
                    : "#C0C0C0";
              const isSelected =
                theater.name === "All Theaters"
                  ? selectedTheaters.length === 0 && !showFavoritesOnly
                  : theater.name === "My Favs"
                    ? showFavoritesOnly
                    : selectedTheaters.includes(theater.name);

              return (
                <button
                  key={theater.name}
                  onClick={() => {
                    if (theater.name === "My Favs") {
                      rotateQuote();
                      setShowFavoritesOnly((current) => !current);
                      return;
                    }

                    setShowFavoritesOnly(false);
                    toggleTheater(theater.name);
                  }}
                  title={theater.name}
                  className={`flex h-32 w-32 items-center justify-center rounded-full border bg-black p-3 transition ${
                    isSelected ? "text-black" : "text-white"
                  }`}
                  style={{
                    borderColor: accentColor,
                    boxShadow: isSelected ? `0 0 0 1px ${accentColor}` : "none",
                  }}
                >
                  <Image
                    src={theater.logo}
                    alt={theater.name}
                    width={104}
                    height={104}
                    className="max-h-full max-w-full object-contain"
                  />
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-12">
          {favoriteError ? (
            <div className="rounded-2xl border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-100">
              {favoriteError}
            </div>
          ) : null}
          {selectedDate ? (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-400">
                Showing films for {formatDateHeading(selectedDate)}
              </p>
              <button
                type="button"
                onClick={() => {
                  rotateQuote();
                  setSelectedDate(null);
                }}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-white transition hover:border-zinc-500"
              >
                Clear date
              </button>
            </div>
          ) : null}
          {groupedPrograms.map(([date, dayPrograms]) => (
            <div key={date}>
              <h2 className="mb-6 border-b border-zinc-800 pb-2 text-2xl font-semibold text-white">
                {formatDateHeading(date)}
              </h2>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {dayPrograms.map((program) => {
                  const theater = theaters.find(
                    (candidate) => candidate.slug === program.theater
                  );
                  const accentColor = theaterAccentColors[program.theater];
                  const posterUrls = getProgramPosterUrls(program);
                  const columns =
                    posterUrls.length <= 1
                      ? "grid-cols-1"
                      : posterUrls.length === 2
                        ? "grid-cols-2"
                        : "grid-cols-2";

                  return (
                    <div
                      key={program.id}
                      className="rounded-2xl border bg-zinc-900 p-4"
                      style={{ borderColor: accentColor }}
                    >
                      <div
                        className={`mb-4 grid aspect-[2/3] gap-2 overflow-hidden rounded-xl bg-zinc-950 ${columns}`}
                      >
                        {posterUrls.length > 0 ? (
                          posterUrls.map((posterUrl, index) => (
                            <div
                              key={`${program.id}-${index}`}
                              className="relative h-full w-full bg-black"
                            >
                              <Image
                                src={posterUrl}
                                alt={getProgramHeading(program)}
                                fill
                                sizes="(min-width: 1024px) 18rem, (min-width: 640px) 22rem, 100vw"
                                className="object-contain"
                              />
                            </div>
                          ))
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                            Poster unavailable
                          </div>
                        )}
                      </div>

                      <h3 className="text-xl font-semibold">
                        {getProgramHeading(program)}
                      </h3>
                      {program.films.length === 1 &&
                      getFilmMetadataLine(program.films[0]) ? (
                        <p className="mt-1 text-sm text-zinc-500">
                          {getFilmMetadataLine(program.films[0])}
                        </p>
                      ) : null}
                      <p className="mt-1 text-zinc-400">
                        {theater?.name} • {theater?.neighborhood}
                      </p>
                      <p className="mt-1 text-zinc-400">
                        {formatTimeForDisplay(program.startTime) ?? "Time TBA"}
                        {program.format ? ` • ${program.format}` : ""}
                      </p>
                      {program.showtimes.length > 1 ? (
                        <p className="mt-1 text-sm text-zinc-500">
                          {program.showtimes
                            .map((showtime) => formatTimeForDisplay(showtime.time) ?? showtime.time)
                            .join(" • ")}
                        </p>
                      ) : null}

                      {program.films.length > 1 ? (
                        <div className="mt-4 space-y-3">
                          {program.films.map((film) => (
                            <details
                              key={film.id}
                              className="border-t border-zinc-800 pt-3"
                            >
                              <summary className="list-none">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1 cursor-pointer">
                                    <p className="font-medium text-white">
                                      {film.startTime
                                        ? `${formatTimeForDisplay(film.startTime)} • `
                                        : ""}
                                      {film.title}
                                    </p>
                                    {getFilmMetadataLine(film) ? (
                                      <p className="mt-1 text-sm text-zinc-500">
                                        {getFilmMetadataLine(film)}
                                      </p>
                                    ) : null}
                                  </div>
                                  <StarButton
                                    active={isFavoriteFilm(film.id)}
                                    onClick={() => toggleFavoriteFilm(film.id)}
                                  />
                                </div>
                              </summary>
                              {film.sourceEnrichment.overview ??
                              film.tmdb?.overview ? (
                                <p className="mt-2 text-sm text-zinc-400">
                                  {film.sourceEnrichment.overview ??
                                    film.tmdb?.overview}
                                </p>
                              ) : null}
                            </details>
                          ))}
                        </div>
                      ) : null}

                      {program.specialGuests.length > 0 ? (
                        <p className="mt-3 text-sm text-amber-300">
                          {program.specialGuests.join(" • ")}
                        </p>
                      ) : null}

                      {program.films.length === 1 ? (
                        <details className="mt-4 border-t border-zinc-800 pt-3">
                          <summary className="cursor-pointer list-none font-medium text-white">
                            Learn more
                          </summary>
                          {program.films[0].sourceEnrichment.overview ??
                          program.films[0].tmdb?.overview ? (
                            <p className="mt-2 text-sm text-zinc-400">
                              {program.films[0].sourceEnrichment.overview ??
                                program.films[0].tmdb?.overview}
                            </p>
                          ) : null}
                          {program.notes ? (
                            <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">
                              {program.notes}
                            </p>
                          ) : null}
                        </details>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-3">
                        {program.showtimes.length > 1
                          ? program.showtimes.map((showtime) => (
                              <a
                                key={`${program.id}-${showtime.time}`}
                                href={showtime.ticketUrl ?? program.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-block rounded-lg px-4 py-2 text-sm font-medium ${
                                  showtime.soldOut
                                    ? "border border-zinc-700 text-zinc-500"
                                    : "bg-white text-black"
                                }`}
                              >
                                {formatTimeForDisplay(showtime.time) ?? showtime.time}
                                {showtime.soldOut ? " (Sold out)" : ""}
                              </a>
                            ))
                          : program.ticketUrl ? (
                              <a
                                href={program.ticketUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
                              >
                                Tickets
                              </a>
                            ) : null}
                        {program.films.length === 1 ? (
                          <StarButton
                            active={isFavoriteFilm(program.films[0].id)}
                            onClick={() => toggleFavoriteFilm(program.films[0].id)}
                          />
                        ) : null}
                        <a
                          href={program.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-white"
                        >
                          Source
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {groupedPrograms.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-zinc-400">
              No films found for the current filters.
            </div>
          ) : null}
        </section>

      </div>
    </main>
  );
}
