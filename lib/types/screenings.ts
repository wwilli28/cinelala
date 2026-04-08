export type TheaterSlug =
  | "new-beverly"
  | "aero"
  | "egyptian"
  | "vista"
  | "nuart"
  | "academy";

export interface TheaterDefinition {
  slug: TheaterSlug;
  name: string;
  url: string;
  logo: string;
  neighborhood: string;
}

export interface SourceFilmEnrichment {
  posterUrl: string | null;
  overview: string | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  format: string | null;
  director: string | null;
}

export interface TmdbFilmEnrichment {
  tmdbId: number;
  posterPath: string | null;
  overview: string | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  director: string | null;
  matchConfidence: "high";
}

export interface ProgramFilm {
  id: string;
  title: string;
  startTime: string | null;
  sourceEnrichment: SourceFilmEnrichment;
  tmdb: TmdbFilmEnrichment | null;
}

export interface ProgramShowtime {
  ticketUrl: string | null;
  time: string;
  soldOut: boolean;
}

export interface ScreeningProgram {
  id: string;
  theater: TheaterSlug;
  sourceUrl: string;
  ticketUrl: string | null;
  date: string;
  displayDate: string;
  startTime: string | null;
  title: string | null;
  films: ProgramFilm[];
  showtimes: ProgramShowtime[];
  format: string | null;
  specialGuests: string[];
  notes: string | null;
  sourceImageUrl: string | null;
}

export interface TheaterSourceStatus {
  theater: TheaterSlug;
  available: boolean;
  message: string | null;
  sourceUrl: string;
}

export interface TheaterProgramsResult {
  programs: ScreeningProgram[];
  status: TheaterSourceStatus;
}
