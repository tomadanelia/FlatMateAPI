import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PersonalityTestFilter } from './dto/personality-test-filter.dto';

describe('AdminService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new AdminService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists user names and IDs in a stable sorted order', async () => {
    const users = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        displayName: 'Alex',
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        displayName: 'Taylor',
      },
    ];
    prisma.user.findMany.mockResolvedValue(users);

    await expect(service.listUsers()).resolves.toEqual(users);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      select: { id: true, displayName: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
  });

  it.each([
    {
      status: PersonalityTestFilter.SHORT_ONLY,
      expectedRelations: ['some', 'none'],
      expectedSlugs: ['big-five-v1', 'big-five-v2'],
    },
    {
      status: PersonalityTestFilter.LONG_ONLY,
      expectedRelations: ['some', 'none'],
      expectedSlugs: ['big-five-v2', 'big-five-v1'],
    },
    {
      status: PersonalityTestFilter.BOTH,
      expectedRelations: ['some', 'some'],
      expectedSlugs: ['big-five-v1', 'big-five-v2'],
    },
  ])('filters users with completed tests for $status', async (scenario) => {
    const users = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        displayName: 'Alex',
        email: 'alex@example.com',
      },
    ];
    prisma.user.findMany.mockResolvedValue(users);

    await expect(
      service.listUsersByTestStatus(scenario.status),
    ).resolves.toEqual(users);
    const query = prisma.user.findMany.mock.calls[0][0];
    expect(query.select).toEqual({
      id: true,
      displayName: true,
      email: true,
    });
    expect(query.where.AND).toHaveLength(2);
    query.where.AND.forEach(
      (
        condition: Record<string, { [key: string]: unknown }>,
        index: number,
      ) => {
        const relation = scenario.expectedRelations[index];
        expect(condition.testAttempts[relation]).toEqual({
          completedAt: { not: null },
          testDefinition: { slug: scenario.expectedSlugs[index] },
        });
      },
    );
  });

  it.each([
    {
      slugs: [],
      status: 'NONE',
      completedShort: false,
      completedLong: false,
    },
    {
      slugs: ['big-five-v1'],
      status: 'SHORT_ONLY',
      completedShort: true,
      completedLong: false,
    },
    {
      slugs: ['big-five-v2'],
      status: 'LONG_ONLY',
      completedShort: false,
      completedLong: true,
    },
    {
      slugs: ['big-five-v1', 'big-five-v2'],
      status: 'BOTH',
      completedShort: true,
      completedLong: true,
    },
  ])('reports completed personality tests as $status', async (scenario) => {
    prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      testAttempts: scenario.slugs.map((slug) => ({
        testDefinition: { slug },
      })),
      _count: {
        musicGenres: 0,
        favoriteArtists: 0,
        movieGenres: 0,
        favoriteMovies: 0,
        tasteItems: 0,
      },
    });

    await expect(
      service.getUserCompletionStatus('00000000-0000-4000-8000-000000000001'),
    ).resolves.toMatchObject({
      personalityTests: {
        status: scenario.status,
        completedShort: scenario.completedShort,
        completedLong: scenario.completedLong,
      },
      tastes: { selected: false },
    });
  });

  it('reports taste selections and imported taste data', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      testAttempts: [],
      _count: {
        musicGenres: 2,
        favoriteArtists: 1,
        movieGenres: 0,
        favoriteMovies: 3,
        tasteItems: 4,
      },
    });

    await expect(
      service.getUserCompletionStatus('00000000-0000-4000-8000-000000000001'),
    ).resolves.toMatchObject({
      tastes: {
        selected: true,
        counts: {
          musicGenres: 2,
          favoriteArtists: 1,
          movieGenres: 0,
          favoriteMovies: 3,
          importedItems: 4,
        },
      },
    });
  });

  it('rejects completion status lookup for an unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.getUserCompletionStatus('00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a user and returns a deletion receipt', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'test@example.com',
    });
    prisma.user.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.deleteUser('00000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'test@example.com',
      deleted: true,
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('rejects an unknown user without attempting a delete', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.deleteUser('missing-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it('handles a user deleted concurrently as not found', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'test@example.com',
    });
    prisma.user.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deleteUser('00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
