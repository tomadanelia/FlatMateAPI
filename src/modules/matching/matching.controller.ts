import { Body, Controller, Post } from '@nestjs/common';
import { FindMatchesDto } from './dto/find-matches.dto';
import { MatchingService } from './matching.service';
@Controller('matches')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}
  @Post('search') find(@Body() dto: FindMatchesDto) { return this.matching.find(dto); }
}
