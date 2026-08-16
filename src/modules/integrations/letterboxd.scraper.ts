import { load } from "cheerio";

const LETTERBOXD_ORIGIN = "https://letterboxd.com";

export interface LetterboxdFavorite {
  externalId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  filmUrl: string;
}

function absoluteUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value, LETTERBOXD_ORIGIN).toString();
  } catch {
    return null;
  }
}

export function isLetterboxdProfilePage(html: string): boolean {
  const $ = load(html);
  return $("body.screen-member-profile").length > 0;
}

export function scrapeLetterboxdFavorites(html: string): LetterboxdFavorite[] {
  const $ = load(html);
  const favorites: LetterboxdFavorite[] = [];

  $("#favourites .favourite-production-poster-container").each(
    (_, container) => {
      const poster = $(container)
        .find("[data-item-slug], [data-film-slug]")
        .first();
      const slug =
        poster.attr("data-item-slug") ?? poster.attr("data-film-slug");
      const displayName =
        poster.attr("data-item-name") ??
        poster.attr("data-film-name") ??
        poster
          .find("img[alt]")
          .attr("alt")
          ?.replace(/^Poster for\s+/i, "");
      const relativeFilmUrl =
        poster.attr("data-item-link") ??
        poster.attr("data-target-link") ??
        poster.find('a[href*="/film/"]').attr("href");

      if (!slug || !displayName || !relativeFilmUrl) return;

      const yearMatch = displayName.match(/\s+\((\d{4})\)$/);
      const filmUrl = absoluteUrl(relativeFilmUrl);
      if (!filmUrl) return;

      favorites.push({
        externalId: slug,
        title: yearMatch
          ? displayName.slice(0, -yearMatch[0].length)
          : displayName,
        year: yearMatch ? Number(yearMatch[1]) : null,
        posterUrl: absoluteUrl(
          poster.find("img.image, img[alt]").first().attr("src"),
        ),
        filmUrl,
      });
    },
  );

  return favorites;
}
