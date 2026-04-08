import { TheaterDefinition, TheaterSlug } from "@/lib/types/screenings";

export const theaters: TheaterDefinition[] = [
  {
    slug: "new-beverly",
    name: "The New Beverly",
    url: "https://thenewbev.com/schedule/",
    logo: "/logos/the-new-beverly.png",
    neighborhood: "Fairfax",
  },
  {
    slug: "aero",
    name: "The Aero",
    url: "https://www.americancinematheque.com/now-showing/?event_location=54",
    logo: "/logos/aero.png",
    neighborhood: "Santa Monica",
  },
  {
    slug: "egyptian",
    name: "The Egyptian",
    url: "https://www.americancinematheque.com/now-showing/?event_location=55",
    logo: "/logos/egyptian.png",
    neighborhood: "Hollywood",
  },
  {
    slug: "vista",
    name: "The Vista",
    url: "https://www.vistatheaterhollywood.com/schedule/",
    logo: "/logos/the-vista.png",
    neighborhood: "Los Feliz",
  },
  {
    slug: "nuart",
    name: "Nuart",
    url: "https://www.landmarktheatres.com/our-locations/x00cw-landmark-nuart-theatre-west-los-angeles/",
    logo: "/logos/nuart.png",
    neighborhood: "West Los Angeles",
  },
  {
    slug: "academy",
    name: "The Academy Theater",
    url: "https://www.academymuseum.org/en/calendar?programTypes=16i3uOYQwism7sMDhIQr2O",
    logo: "/logos/academy-theater.png",
    neighborhood: "Mid-Wilshire",
  },
];

export const theaterAccentColors: Record<TheaterSlug, string> = {
  "new-beverly": "#C7332E",
  aero: "#6D8F3C",
  egyptian: "#F5F5F5",
  vista: "#3E63B8",
  nuart: "#E36AA5",
  academy: "#C7A24A",
};

const theaterMap = new Map<TheaterSlug, TheaterDefinition>(
  theaters.map((theater) => [theater.slug, theater])
);

export function getTheater(slug: TheaterSlug) {
  return theaterMap.get(slug);
}
