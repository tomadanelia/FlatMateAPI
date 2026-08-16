import { NotFoundException } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";

describe("IntegrationsService Letterboxd flow", () => {
  const prisma = {
    externalIntegration: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    tasteItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new IntegrationsService(prisma as never);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    prisma.externalIntegration.upsert.mockResolvedValue({
      username: "filmfan",
      lastSyncedAt: new Date("2026-08-16T12:00:00.000Z"),
    });
    prisma.tasteItem.deleteMany.mockResolvedValue({ count: 0 });
    prisma.tasteItem.createMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  });

  it("verifies, scrapes, and stores a public profile", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        `<body class="screen-member-profile"><section id="favourites">
          <div class="favourite-production-poster-container">
            <div data-item-name="The Godfather (1972)" data-item-slug="the-godfather"
              data-item-link="/film/the-godfather/"><img class="image" src="/poster.jpg"></div>
          </div></section></body>`,
        { status: 200 },
      ),
    );

    const result = await service.connectLetterboxd({
      userId: "b6ca1202-94b1-40f6-8797-d0a059674a80",
      username: "filmfan",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://letterboxd.com/filmfan/",
      expect.objectContaining({ redirect: "follow" }),
    );
    expect(prisma.tasteItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          externalId: "the-godfather",
          name: "The Godfather",
          metadata: expect.objectContaining({
            year: 1972,
            posterUrl: "https://letterboxd.com/poster.jpg",
            position: 0,
          }),
        }),
      ],
    });
    expect(result.favorites[0].title).toBe("The Godfather");
  });

  it("rejects a missing profile without changing stored data", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(
      service.connectLetterboxd({
        userId: "b6ca1202-94b1-40f6-8797-d0a059674a80",
        username: "missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns stored favorites in Letterboxd profile order", async () => {
    prisma.externalIntegration.findUnique.mockResolvedValue({
      username: "filmfan",
      status: "CONNECTED",
      lastSyncedAt: new Date("2026-08-16T12:00:00.000Z"),
      metadata: { profileUrl: "https://letterboxd.com/filmfan/" },
    });
    prisma.tasteItem.findMany.mockResolvedValue([
      {
        externalId: "second",
        name: "Second",
        metadata: {
          position: 1,
          filmUrl: "https://letterboxd.com/film/second/",
        },
      },
      {
        externalId: "first",
        name: "First",
        metadata: {
          position: 0,
          filmUrl: "https://letterboxd.com/film/first/",
        },
      },
    ]);

    const result = await service.getLetterboxdFavorites(
      "b6ca1202-94b1-40f6-8797-d0a059674a80",
    );

    expect(result.favorites.map((favorite) => favorite.title)).toEqual([
      "First",
      "Second",
    ]);
  });
});
