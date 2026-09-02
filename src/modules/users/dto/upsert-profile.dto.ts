import { Gender, LookingFor } from "../../../generated/prisma/client";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";

export class UpsertProfileDto {
  @IsUUID() id: string;
  @IsEmail() email: string;
  @IsString() @Length(1, 80) displayName: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsEnum(LookingFor) lookingFor?: LookingFor;
  @IsOptional() @IsString() @Length(0, 1000) bio?: string;
  @IsString() @Length(1, 100) city: string;
  @IsString() @Length(2, 2) countryCode: string;
  @IsInt() @Min(0) minMonthlyBudget: number;
  @IsInt() @Min(1) maxMonthlyBudget: number;
  @IsString() @Length(3, 3) currency: string;
  @IsOptional() @IsDateString() moveInDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) preferredAreas?: string[];
  @IsOptional()
  @IsArray()
  @IsEnum(Gender, { each: true })
  preferredRoommateGenders?: Gender[];
  @IsInt() @Min(1) @Max(5) cleanliness: number;
  @IsInt() @Min(1) @Max(5) socialLevel: number;
  @IsInt() @Min(1) @Max(5) sleepSchedule: number;
  @IsInt() @Min(1) @Max(5) noiseTolerance: number;
  @IsInt() @Min(1) @Max(5) guestsFrequency: number;
  @IsBoolean() smokingAllowed: boolean;
  @IsBoolean() petsAllowed: boolean;
  @IsBoolean() hasPets: boolean;
}
