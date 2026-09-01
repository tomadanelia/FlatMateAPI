import { BadRequestException } from "@nestjs/common";
import { bigFiveV2Questions } from "../../../prisma/big-five-v2";
import { TestsService } from "./tests.service";

describe("TestsService", () => {
  const definition = {
    id: "test-v2",
    questions: bigFiveV2Questions.map(
      ([code, _prompt, trait, reverseScored], index) => ({
        id: `question-${index + 1}`,
        code,
        trait,
        reverseScored,
        minValue: 1,
        maxValue: 5,
        weight: 1,
      }),
    ),
  };

  it("returns every active version in version order for frontend selection", async () => {
    const availableTests = [
      { slug: "big-five-v1", version: 1 },
      { slug: "big-five-v2", version: 2 },
    ];
    const findMany = jest.fn().mockResolvedValue(availableTests);
    const service = new TestsService({
      testDefinition: { findMany },
    } as never);

    await expect(service.list()).resolves.toEqual(availableTests);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: [{ type: "asc" }, { version: "asc" }],
      }),
    );
  });

  it("contains 10 items for each of the five canonical traits", () => {
    expect(bigFiveV2Questions).toHaveLength(50);
    const counts = bigFiveV2Questions.reduce<Record<string, number>>(
      (result, [, , trait]) => ({
        ...result,
        [trait]: (result[trait] ?? 0) + 1,
      }),
      {},
    );
    expect(counts).toEqual({
      extraversion: 10,
      agreeableness: 10,
      conscientiousness: 10,
      neuroticism: 10,
      openness: 10,
    });
  });

  it("stores every response and correctly scores positive and negative keys", async () => {
    const create = jest.fn(({ data }) => ({
      id: "attempt-v2",
      ...data,
      traitScores: data.traitScores.create,
    }));
    const prisma = {
      testDefinition: { findUnique: jest.fn().mockResolvedValue(definition) },
      $transaction: jest.fn((callback) =>
        callback({ testAttempt: { create } }),
      ),
    };
    const service = new TestsService(prisma as never);
    const answers = definition.questions.map((question) => ({
      questionId: question.id,
      value: 5,
    }));

    const result = await service.submit({
      userId: "user-id",
      testDefinitionId: definition.id,
      answers,
    });

    expect(prisma.testDefinition.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: definition.id, isActive: true },
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responses: { create: answers },
        }),
      }),
    );
    expect(result.traitScores).toEqual(
      expect.arrayContaining([
        { trait: "extraversion", score: 0.5 },
        { trait: "agreeableness", score: 0.6 },
        { trait: "conscientiousness", score: 0.6 },
        { trait: "neuroticism", score: 0.8 },
        { trait: "openness", score: 0.7 },
      ]),
    );
  });

  it("rejects duplicate answers instead of failing inside the transaction", async () => {
    const prisma = {
      testDefinition: { findUnique: jest.fn().mockResolvedValue(definition) },
    };
    const service = new TestsService(prisma as never);
    const answers = definition.questions.map((question) => ({
      questionId: question.id,
      value: 3,
    }));
    answers.push(answers[0]);

    await expect(
      service.submit({
        userId: "user-id",
        testDefinitionId: definition.id,
        answers,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
