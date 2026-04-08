import { getTheater } from "@/lib/constants/theaters";
import { ScreeningProgram } from "@/lib/types/screenings";

export function getProgramHeading(program: ScreeningProgram) {
  if (program.title) {
    return program.title;
  }

  return program.films.map((film) => film.title).join(" / ");
}

export function getProgramPosterUrls(program: ScreeningProgram) {
  const posters = program.films
    .map((film) => film.sourceEnrichment.posterUrl ?? film.tmdb?.posterPath)
    .filter((poster): poster is string => Boolean(poster));

  if (posters.length > 0) {
    return posters.slice(0, 4);
  }

  if (program.sourceImageUrl) {
    return [program.sourceImageUrl];
  }

  const theater = getTheater(program.theater);
  return theater ? [theater.logo] : [];
}

export function getFilmMetadataLine(program: ScreeningProgram["films"][number]) {
  const parts = [];
  const year =
    program.sourceEnrichment.releaseDate?.slice(0, 4) ??
    program.tmdb?.releaseDate?.slice(0, 4) ??
    null;
  const director =
    program.sourceEnrichment.director ??
    program.tmdb?.director ??
    null;

  if (year) {
    parts.push(year);
  }

  if (director) {
    parts.push(director);
  }

  return parts.join(" • ");
}
