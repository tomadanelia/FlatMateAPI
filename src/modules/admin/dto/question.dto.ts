import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionKind } from '../../../generated/prisma/client';

export class CreateQuestionDto {
  @IsString()
  @Length(1, 50)
  code: string;

  @IsString()
  @Length(1, 1000)
  prompt: string;

  @IsOptional()
  @IsEnum(QuestionKind)
  kind?: QuestionKind;

  @IsString()
  @Length(1, 100)
  trait: string;

  @IsOptional()
  @IsBoolean()
  reverseScored?: boolean;

  @IsInt()
  @Min(1)
  position: number;

  @IsOptional()
  @IsArray()
  options?: unknown[];

  @IsOptional()
  @IsInt()
  minValue?: number;

  @IsOptional()
  @IsInt()
  maxValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;
}

export class UploadQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions: CreateQuestionDto[];
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  prompt?: string;

  @IsOptional()
  @IsEnum(QuestionKind)
  kind?: QuestionKind;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  trait?: string;

  @IsOptional()
  @IsBoolean()
  reverseScored?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @IsOptional()
  @IsArray()
  options?: unknown[];

  @IsOptional()
  @IsInt()
  minValue?: number;

  @IsOptional()
  @IsInt()
  maxValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;
}
