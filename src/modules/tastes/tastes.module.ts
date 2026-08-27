import { Module } from "@nestjs/common";
import { TastesController } from "./tastes.controller";
import { TastesService } from "./tastes.service";

@Module({ controllers: [TastesController], providers: [TastesService] })
export class TastesModule {}
