import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SubmitTestDto } from './dto/submit-test.dto';
import { TestsService } from './tests.service';
@Controller('tests')
export class TestsController {
  constructor(private readonly tests: TestsService) {}
  @Get() list() { return this.tests.list(); }
  @Get(':slug') questions(@Param('slug') slug: string) { return this.tests.questions(slug); }
  @Post('submissions') submit(@Body() dto: SubmitTestDto) { return this.tests.submit(dto); }
}
