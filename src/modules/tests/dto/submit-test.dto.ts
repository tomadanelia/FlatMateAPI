import { IsArray, IsNumber, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AnswerDto {
  @IsUUID() questionId: string;
  @IsNumber() @Min(1) @Max(5) value: number;
}
export class SubmitTestDto {
  @IsUUID() userId: string;
  @IsUUID() testDefinitionId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerDto) answers: AnswerDto[];
}
