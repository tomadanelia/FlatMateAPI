import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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

  @Get("me/blocks")
  @UseGuards(JwtAuthGuard)
  listBlocks(@Req() request: AuthenticatedRequest) {
    return this.users.listBlocks(request.user.id);
  }

  @Post(":id/block")
  @UseGuards(JwtAuthGuard)
  block(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.users.block(request.user.id, id);
  }

  @Delete(":id/block")
  @UseGuards(JwtAuthGuard)
  unblock(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.users.unblock(request.user.id, id);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.users.findPublicProfile(request.user.id, id);
  }
}
