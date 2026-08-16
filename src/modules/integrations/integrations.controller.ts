import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  ConnectIntegrationDto,
  ConnectLetterboxdDto,
  SyncTasteDto,
} from "./dto/integration.dto";
import { IntegrationsService } from "./integrations.service";
@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}
  @Post("connect") connect(@Body() dto: ConnectIntegrationDto) {
    return this.integrations.connect(dto);
  }
  @Post("taste/sync") sync(@Body() dto: SyncTasteDto) {
    return this.integrations.sync(dto);
  }
  @Post("letterboxd/connect") connectLetterboxd(
    @Body() dto: ConnectLetterboxdDto,
  ) {
    return this.integrations.connectLetterboxd(dto);
  }
  @Get("letterboxd/:userId/favorites") getLetterboxdFavorites(
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.integrations.getLetterboxdFavorites(userId);
  }
}
