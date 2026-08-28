import { LifestyleAlgorithm } from "./lifestyle.algorithm";
import { PersonalityAlgorithm } from "./personality.algorithm";
import { TasteAlgorithm } from "./taste.algorithm";

const profile = (overrides: Record<string, unknown> = {}) =>
  ({
    testAttempts: [],
    lifestyleProfile: null,
    musicGenres: [],
    favoriteArtists: [],
    movieGenres: [],
    favoriteMovies: [],
    ...overrides,
  }) as never;

const musicGenre = (id: string, name: string) => ({ musicGenre: { id, name } });
const artist = (id: string, name: string) => ({ artist: { id, name } });
const movieGenre = (id: string, name: string) => ({ movieGenre: { id, name } });
const movie = (id: string, title: string) => ({ movie: { id, title } });

describe("matching algorithms", () => {
  it("scores identical personality traits as 1", () => {
    const p = profile({
      testAttempts: [{ traitScores: [{ trait: "openness", score: 0.8 }] }],
    });
    expect(new PersonalityAlgorithm().score(p, p)?.score).toBe(1);
  });
  it("makes a pet incompatibility a zero lifestyle score", () => {
    const base = {
      cleanliness: 3,
      socialLevel: 3,
      sleepSchedule: 3,
      noiseTolerance: 3,
      guestsFrequency: 3,
      smokingAllowed: false,
    };
    const a = profile({
      lifestyleProfile: { ...base, hasPets: true, petsAllowed: true },
    });
    const b = profile({
      lifestyleProfile: { ...base, hasPets: false, petsAllowed: false },
    });
    expect(new LifestyleAlgorithm().score(a, b)?.score).toBe(0);
  });

  it("scores manually selected taste dimensions and favors exact favorites", () => {
    const a = profile({
      musicGenres: [musicGenre("rock", "Rock"), musicGenre("jazz", "Jazz")],
      favoriteArtists: [artist("radiohead", "Radiohead")],
      movieGenres: [movieGenre("drama", "Drama")],
      favoriteMovies: [movie("arrival", "Arrival")],
    });
    const b = profile({
      musicGenres: [musicGenre("rock", "Rock")],
      favoriteArtists: [artist("radiohead", "Radiohead")],
      movieGenres: [movieGenre("comedy", "Comedy")],
      favoriteMovies: [movie("arrival", "Arrival")],
    });

    const result = new TasteAlgorithm().score(a, b);

    // (0.5 * 1 + 1 * 1.5 + 0 * 1 + 1 * 1.5) / 5
    expect(result?.score).toBeCloseTo(0.7);
    expect(result?.explanation).toMatchObject({
      comparedDimensions: ["musicGenres", "artists", "movieGenres", "movies"],
      byDimension: {
        artists: { shared: ["Radiohead"] },
        movies: { shared: ["Arrival"] },
      },
    });
  });

  it("uses only mutually answered dimensions when movie taste is missing", () => {
    const a = profile({
      musicGenres: [musicGenre("rock", "Rock")],
      favoriteMovies: [movie("arrival", "Arrival")],
    });
    const b = profile({
      musicGenres: [musicGenre("rock", "Rock")],
    });

    const result = new TasteAlgorithm().score(a, b);

    expect(result?.score).toBe(1);
    expect(result?.explanation).toMatchObject({
      comparedDimensions: ["musicGenres"],
    });
  });

  it("returns null when users have no mutually answered taste dimension", () => {
    const musicOnly = profile({
      favoriteArtists: [artist("radiohead", "Radiohead")],
    });
    const moviesOnly = profile({
      favoriteMovies: [movie("arrival", "Arrival")],
    });

    expect(new TasteAlgorithm().score(musicOnly, moviesOnly)).toBeNull();
  });

  it("returns zero when an answered dimension has no overlap", () => {
    const a = profile({ favoriteArtists: [artist("a", "Artist A")] });
    const b = profile({ favoriteArtists: [artist("b", "Artist B")] });

    expect(new TasteAlgorithm().score(a, b)?.score).toBe(0);
  });
});
