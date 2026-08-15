import { Body, Controller, Post } from '@nestjs/common';
import { ConnectIntegrationDto, SyncTasteDto } from './dto/integration.dto';
import { IntegrationsService } from './integrations.service';
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}
  @Post('connect') connect(@Body() dto: ConnectIntegrationDto) { return this.integrations.connect(dto); }
  @Post('taste/sync') sync(@Body() dto: SyncTasteDto) { return this.integrations.sync(dto); }
}
