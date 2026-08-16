import {
  isLetterboxdProfilePage,
  scrapeLetterboxdFavorites,
} from "./letterboxd.scraper";

describe("Letterboxd scraper", () => {
  const html = `
    <body class="screen-member-profile logged-in my-own-page">
      <section id="favourites">
        <div class="favourite-production-poster-container">
          <div class="react-component" data-item-name="Me and Earl and the Dying Girl (2015)"
            data-item-slug="me-and-earl-and-the-dying-girl"
            data-item-link="/film/me-and-earl-and-the-dying-girl/">
            <img class="image" src="https://a.ltrbxd.com/poster.jpg" alt="Poster">
          </div>
        </div>
      </section>
    </body>`;

  it("recognizes a member profile and extracts favorite film details", () => {
    expect(isLetterboxdProfilePage(html)).toBe(true);
    expect(scrapeLetterboxdFavorites(html)).toEqual([
      {
        externalId: "me-and-earl-and-the-dying-girl",
        title: "Me and Earl and the Dying Girl",
        year: 2015,
        posterUrl: "https://a.ltrbxd.com/poster.jpg",
        filmUrl: "https://letterboxd.com/film/me-and-earl-and-the-dying-girl/",
      },
    ]);
  });

  it("does not scrape posters outside the favorites section", () => {
    expect(
      scrapeLetterboxdFavorites(html.replace('id="favourites"', 'id="recent"')),
    ).toEqual([]);
  });
});
