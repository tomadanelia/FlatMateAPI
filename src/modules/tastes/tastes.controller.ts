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
import { UpdateTastesDto } from "./dto/update-tastes.dto";
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

  @Put("tastes/:userId") updateUserTastes(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateTastesDto,
  ) {
    return this.tastes.updateUserTastes(userId, dto);
  }
}
