import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Put('profile') upsert(@Body() dto: UpsertProfileDto) { return this.users.upsert(dto); }
  @Get(':id') findOne(@Param('id') id: string) { return this.users.findOne(id); }
}
