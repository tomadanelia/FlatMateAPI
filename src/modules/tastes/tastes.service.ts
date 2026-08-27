import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CatalogQueryDto } from "./dto/catalog-query.dto";
import { UpdateTastesDto } from "./dto/update-tastes.dto";

const genreSelect = { id: true, name: true } as const;

@Injectable()
export class TastesService {
  constructor(private readonly prisma: PrismaService) {}

  listMusicGenres() {
    return this.prisma.musicGenre.findMany({
      orderBy: { name: "asc" },
      select: genreSelect,
    });
  }

  searchArtists(query: CatalogQueryDto) {
    return this.prisma.artist.findMany({
      where: query.search?.trim()
        ? { name: { contains: query.search.trim(), mode: "insensitive" } }
        : undefined,
      orderBy: { name: "asc" },
      take: query.limit,
      select: {
        id: true,
        name: true,
        genres: { select: { musicGenre: { select: genreSelect } } },
      },
    });
  }

  listMovieGenres() {
    return this.prisma.movieGenre.findMany({
      orderBy: { name: "asc" },
      select: genreSelect,
    });
  }

  searchMovies(query: CatalogQueryDto) {
    return this.prisma.movie.findMany({
      where: query.search?.trim()
        ? { title: { contains: query.search.trim(), mode: "insensitive" } }
        : undefined,
      orderBy: { title: "asc" },
      take: query.limit,
      select: {
        id: true,
        title: true,
        genres: { select: { movieGenre: { select: genreSelect } } },
      },
    });
  }

  getUserTastes(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        musicGenres: { select: { musicGenre: { select: genreSelect } } },
        favoriteArtists: {
          select: { artist: { select: { id: true, name: true } } },
        },
        movieGenres: { select: { movieGenre: { select: genreSelect } } },
        favoriteMovies: {
          select: { movie: { select: { id: true, title: true } } },
        },
      },
    });
  }

  async updateUserTastes(userId: string, dto: UpdateTastesDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.userMusicGenre.deleteMany({ where: { userId } });
      await tx.userArtist.deleteMany({ where: { userId } });
      await tx.userMovieGenre.deleteMany({ where: { userId } });
      await tx.userMovie.deleteMany({ where: { userId } });
      if (dto.musicGenreIds.length)
        await tx.userMusicGenre.createMany({
          data: dto.musicGenreIds.map((musicGenreId) => ({
            userId,
            musicGenreId,
          })),
        });
      if (dto.artistIds.length)
        await tx.userArtist.createMany({
          data: dto.artistIds.map((artistId) => ({ userId, artistId })),
        });
      if (dto.movieGenreIds.length)
        await tx.userMovieGenre.createMany({
          data: dto.movieGenreIds.map((movieGenreId) => ({
            userId,
            movieGenreId,
          })),
        });
      if (dto.movieIds.length)
        await tx.userMovie.createMany({
          data: dto.movieIds.map((movieId) => ({ userId, movieId })),
        });
    });
    return this.getUserTastes(userId);
  }
}
