import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AlgorithmKey,
  PrismaClient,
  TestType,
} from "../src/generated/prisma/client";
import { bigFiveV2Questions } from "./big-five-v2";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
type TasteData = {
  musicGenres: string[];
  artists: { name: string; genres: string[] }[];
  movieGenres: string[];
  movies: { title: string; genres: string[] }[];
};
const tasteData = JSON.parse(
  readFileSync(resolve(__dirname, "../data/tasteDataSource.json"), "utf8"),
) as TasteData;
const questions = [
  ["O1", "I enjoy exploring new ideas.", "openness", false],
  ["O2", "I prefer familiar routines.", "openness", true],
  ["C1", "I keep my space organized.", "conscientiousness", false],
  ["C2", "I often leave tasks unfinished.", "conscientiousness", true],
  ["E1", "I feel energized around people.", "extraversion", false],
  ["E2", "I avoid social gatherings.", "extraversion", true],
  ["A1", "I try to understand other viewpoints.", "agreeableness", false],
  ["A2", "I start arguments easily.", "agreeableness", true],
  ["N1", "I often feel stressed.", "neuroticism", false],
  ["N2", "I remain calm under pressure.", "neuroticism", true],
] as const;
async function seedTasteAndAlgorithms() {
  for (const name of tasteData.musicGenres)
    await prisma.musicGenre.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  for (const artist of tasteData.artists) {
    await prisma.artist.upsert({
      where: { name: artist.name },
      update: {
        genres: {
          deleteMany: {},
          create: artist.genres.map((name) => ({
            musicGenre: { connect: { name } },
          })),
        },
      },
      create: {
        name: artist.name,
        genres: {
          create: artist.genres.map((name) => ({
            musicGenre: { connect: { name } },
          })),
        },
      },
    });
  }
  for (const name of tasteData.movieGenres)
    await prisma.movieGenre.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  for (const movie of tasteData.movies) {
    await prisma.movie.upsert({
      where: { title: movie.title },
      update: {
        genres: {
          deleteMany: {},
          create: movie.genres.map((name) => ({
            movieGenre: { connect: { name } },
          })),
        },
      },
      create: {
        title: movie.title,
        genres: {
          create: movie.genres.map((name) => ({
            movieGenre: { connect: { name } },
          })),
        },
      },
    });
  }
  for (const key of Object.values(AlgorithmKey))
    await prisma.algorithmConfig.upsert({
      where: { key },
      update: {},
      create: {
        key,
        enabled: true,
        weight: key === AlgorithmKey.LIFESTYLE ? 1.25 : 1,
        version: key === AlgorithmKey.PERSONALITY ? "2.0.0" : "1.0.0",
      },
    });
}

async function seedPersonalityTests() {
  await prisma.testDefinition.upsert({
    where: { slug: "big-five-v1" },
    update: {
      name: "Big Five (Short, 10-item)",
      isActive: true,
      description:
        "Short 10-item Big Five questionnaire for a quick initial personality profile.",
    },
    create: {
      slug: "big-five-v1",
      name: "Big Five (Short, 10-item)",
      type: TestType.BIG_FIVE,
      version: 1,
      isActive: true,
      description:
        "Short 10-item Big Five questionnaire for a quick initial personality profile.",
      questions: {
        create: questions.map(
          ([code, prompt, trait, reverseScored], position) => ({
            code,
            prompt,
            trait,
            reverseScored,
            position: position + 1,
            minValue: 1,
            maxValue: 5,
            options: [
              { value: 1, label: "Strongly disagree" },
              { value: 2, label: "Disagree" },
              { value: 3, label: "Neutral" },
              { value: 4, label: "Agree" },
              { value: 5, label: "Strongly agree" },
            ],
          }),
        ),
      },
    },
  });

  // Both versions stay active: users may start with the short questionnaire
  // and later submit the longer one for a more detailed set of trait scores.
  const bigFiveV2 = await prisma.testDefinition.upsert({
    where: { slug: "big-five-v2" },
    update: {
      name: "Big Five (IPIP 50-item)",
      type: TestType.BIG_FIVE,
      version: 2,
      isActive: true,
      description:
        "IPIP 50-item Big-Five factor markers. Rate how accurately each statement describes you now from 1 (Very Inaccurate) to 5 (Very Accurate).",
    },
    create: {
      slug: "big-five-v2",
      name: "Big Five (IPIP 50-item)",
      type: TestType.BIG_FIVE,
      version: 2,
      isActive: true,
      description:
        "IPIP 50-item Big-Five factor markers. Rate how accurately each statement describes you now from 1 (Very Inaccurate) to 5 (Very Accurate).",
    },
  });
  const accuracyOptions = [
    { value: 1, label: "Very Inaccurate" },
    { value: 2, label: "Moderately Inaccurate" },
    { value: 3, label: "Neither Accurate Nor Inaccurate" },
    { value: 4, label: "Moderately Accurate" },
    { value: 5, label: "Very Accurate" },
  ];
  for (const [
    position,
    [code, prompt, trait, reverseScored],
  ] of bigFiveV2Questions.entries()) {
    await prisma.question.upsert({
      where: {
        testDefinitionId_code: {
          testDefinitionId: bigFiveV2.id,
          code,
        },
      },
      update: {
        prompt,
        trait,
        reverseScored,
        position: position + 1,
        minValue: 1,
        maxValue: 5,
        options: accuracyOptions,
      },
      create: {
        testDefinitionId: bigFiveV2.id,
        code,
        prompt,
        trait,
        reverseScored,
        position: position + 1,
        minValue: 1,
        maxValue: 5,
        options: accuracyOptions,
      },
    });
  }
}

async function main() {
  // Seed the small, essential questionnaire first so it is not held up by the
  // much larger taste catalog on slow remote database connections.
  await seedPersonalityTests();
  if (!process.argv.includes("--personality-only")) {
    await seedTasteAndAlgorithms();
  }
}

main().finally(() => prisma.$disconnect());
