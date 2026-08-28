import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../auth/interfaces/jwt-payload.interface";
import { UpdateAvatarDto } from "./dto/update-avatar.dto";
import { UpsertProfileDto } from "./dto/upsert-profile.dto";
import { UsersService } from "./users.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Put("profile") upsert(@Body() dto: UpsertProfileDto) {
    return this.users.upsert(dto);
  }
  @Patch("me/avatar")
  @UseGuards(JwtAuthGuard)
  updateAvatar(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateAvatarDto,
  ) {
    return this.users.updateAvatar(request.user.id, dto.avatarUrl);
  }
  @Get(":id") findOne(@Param("id") id: string) {
    return this.users.findOne(id);
  }
}
