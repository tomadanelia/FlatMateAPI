import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from "@nestjs/common";
import { CatalogQueryDto } from "./dto/catalog-query.dto";
import { UpdateMusicTastesDto } from "./dto/update-music-tastes.dto";
import { UpdateMovieTastesDto } from "./dto/update-movie-tastes.dto";
import { TastesService } from "./tastes.service";

@Controller()
export class TastesController {
  constructor(private readonly tastes: TastesService) {}

  @Get("music-genres") listMusicGenres() {
    return this.tastes.listMusicGenres();
  }
  @Get("artists") searchArtists(@Query() query: CatalogQueryDto) {
    return this.tastes.searchArtists(query);
  }
  @Get("movie-genres") listMovieGenres() {
    return this.tastes.listMovieGenres();
  }
  @Get("movies") searchMovies(@Query() query: CatalogQueryDto) {
    return this.tastes.searchMovies(query);
  }

  @Get("tastes/:userId") getUserTastes(
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.tastes.getUserTastes(userId);
  }

  @Put("users/:id/music-tastes") updateMusicTastes(
    @Param("id", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMusicTastesDto,
  ) {
    return this.tastes.updateMusicTastes(userId, dto);
  }

  @Put("users/:id/movie-tastes") updateMovieTastes(
    @Param("id", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMovieTastesDto,
  ) {
    return this.tastes.updateMovieTastes(userId, dto);
  }
}
