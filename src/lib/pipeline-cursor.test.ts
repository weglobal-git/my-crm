import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeCompletedCursor,
  decodeCompletedCursor,
  buildCompletedKeysetWhere,
} from './pipeline-cursor';

test('pipeline-cursor: encodes and decodes keyset token correctly', () => {
  const date = new Date('2026-08-15T12:00:00.000Z');
  const token = encodeCompletedCursor(date, 'deal-99');

  const decoded = decodeCompletedCursor(token);
  assert.ok(decoded);
  assert.equal(decoded.version, 1);
  assert.equal(decoded.id, 'deal-99');
  assert.equal(decoded.closedAt, '2026-08-15T12:00:00.000Z');

  // Null date
  const tokenNullDate = encodeCompletedCursor(null, 'deal-100');
  const decodedNull = decodeCompletedCursor(tokenNullDate);
  assert.ok(decodedNull);
  assert.equal(decodedNull.version, 1);
  assert.equal(decodedNull.id, 'deal-100');
  assert.equal(decodedNull.closedAt, null);

  // Raw legacy ID fallback
  const rawIdDecoded = decodeCompletedCursor('deal-legacy-uuid');
  assert.ok(rawIdDecoded);
  assert.equal(rawIdDecoded.version, undefined);
  assert.equal(rawIdDecoded.id, 'deal-legacy-uuid');
  assert.equal(rawIdDecoded.closedAt, null);
});

test('pipeline-cursor: buildCompletedKeysetWhere builds deterministic SQL conditions', () => {
  const dateStr = '2026-08-15T12:00:00.000Z';
  const where = buildCompletedKeysetWhere({ closedAt: dateStr, id: 'deal-50' });

  assert.ok(Array.isArray(where.OR));
  assert.equal(where.OR?.length, 3);
  assert.deepEqual(where.OR?.[0], { closedAt: { lt: new Date(dateStr) } });
  assert.deepEqual(where.OR?.[1], { closedAt: null });
  assert.deepEqual(where.OR?.[2], {
    AND: [
      { closedAt: new Date(dateStr) },
      { id: { lt: 'deal-50' } },
    ],
  });

  // Null closedAt condition
  const whereNull = buildCompletedKeysetWhere({ closedAt: null, id: 'deal-50' });
  assert.equal(whereNull.closedAt, null);
  assert.deepEqual(whereNull.id, { lt: 'deal-50' });
});

test('pipeline-cursor Finding 2: Keyset pagination continues smoothly even if boundary cursor record is deleted', () => {
  // Simulate a database of 6 items ordered by closedAt DESC, id DESC
  const dbRecords = [
    { id: 'deal-5', closedAt: '2026-08-15T12:00:00.000Z' },
    { id: 'deal-4', closedAt: '2026-08-15T12:00:00.000Z' }, // Identical timestamp
    { id: 'deal-3', closedAt: '2026-08-15T12:00:00.000Z' }, // Page 1 ends here (cursor)
    { id: 'deal-2', closedAt: '2026-08-14T10:00:00.000Z' },
    { id: 'deal-1', closedAt: '2026-08-13T08:00:00.000Z' },
    { id: 'deal-0', closedAt: null },
  ];

  // Page 1 takes 3 items
  const page1 = dbRecords.slice(0, 3);
  assert.deepEqual(page1.map((d) => d.id), ['deal-5', 'deal-4', 'deal-3']);

  // Client creates cursor token from the last item of Page 1
  const cursorToken = encodeCompletedCursor(page1[page1.length - 1].closedAt, page1[page1.length - 1].id);
  const boundary = decodeCompletedCursor(cursorToken)!;

  // CONCURRENT DELETION EVENT: 'deal-3' is deleted from the database!
  const dbRecordsAfterDeletion = dbRecords.filter((d) => d.id !== 'deal-3');

  // Keyset filter evaluated against DB records:
  // WHERE (closedAt < boundary.closedAt) OR (closedAt IS NULL) OR (closedAt = boundary.closedAt AND id < boundary.id)
  const boundaryTime = boundary.closedAt ? new Date(boundary.closedAt).getTime() : 0;
  const page2 = dbRecordsAfterDeletion
    .filter((d) => {
      const dTime = d.closedAt ? new Date(d.closedAt).getTime() : -1;
      if (dTime < boundaryTime) return true;
      if (d.closedAt === null) return true;
      if (dTime === boundaryTime) return d.id < boundary.id;
      return false;
    })
    .slice(0, 3);

  // Assert Page 2 returns the exact subsequent records with ZERO missing items and ZERO duplicates
  assert.deepEqual(page2.map((d) => d.id), ['deal-2', 'deal-1', 'deal-0']);
  assert.equal(page2.some((d) => page1.some((p) => p.id === d.id)), false, 'Zero overlap between pages');
});

test('pipeline-cursor: NULLS LAST pagination correctly handles mixed non-null and null closedAt boundaries', () => {
  // Matches PostgreSQL ORDER BY closedAt DESC NULLS LAST, id DESC
  const dataset = [
    { id: 'deal-5', closedAt: '2026-10-06T12:00:00.000Z' },
    { id: 'deal-4', closedAt: '2026-10-06T10:00:00.000Z' },
    { id: 'deal-3', closedAt: '2026-10-05T08:00:00.000Z' },
    { id: 'deal-2', closedAt: null },
    { id: 'deal-1', closedAt: null },
  ];

  // Helper matching buildCompletedKeysetWhere semantics
  const fetchPage = (cursorPayload: { closedAt: string | null; id: string } | null, take: number) => {
    let records = dataset;
    if (cursorPayload) {
      if (cursorPayload.closedAt) {
        const cursorTime = new Date(cursorPayload.closedAt).getTime();
        records = records.filter((r) => {
          if (r.closedAt === null) return true; // NULLS LAST comes after all dates
          const rTime = new Date(r.closedAt).getTime();
          if (rTime < cursorTime) return true;
          if (rTime === cursorTime) return r.id < cursorPayload.id;
          return false;
        });
      } else {
        // Cursor is already in the null closedAt region
        records = records.filter((r) => r.closedAt === null && r.id < cursorPayload.id);
      }
    }
    return records.slice(0, take);
  };

  const pageSize = 2;
  const collected: string[] = [];

  // Page 1
  const page1 = fetchPage(null, pageSize);
  assert.deepEqual(page1.map((d) => d.id), ['deal-5', 'deal-4']);
  collected.push(...page1.map((d) => d.id));

  // Page 2: Cursor is deal-4 (non-null), page contains deal-3 (non-null) and deal-2 (null)
  const cursor1 = decodeCompletedCursor(encodeCompletedCursor(page1[page1.length - 1].closedAt, page1[page1.length - 1].id))!;
  const page2 = fetchPage(cursor1, pageSize);
  assert.deepEqual(page2.map((d) => d.id), ['deal-3', 'deal-2'], 'Page 2 crosses the boundary into null records');
  collected.push(...page2.map((d) => d.id));

  // Page 3: Cursor is deal-2 (null), page contains deal-1 (null)
  const cursor2 = decodeCompletedCursor(encodeCompletedCursor(page2[page2.length - 1].closedAt, page2[page2.length - 1].id))!;
  const page3 = fetchPage(cursor2, pageSize);
  assert.deepEqual(page3.map((d) => d.id), ['deal-1'], 'Page 3 fetches remaining null records');
  collected.push(...page3.map((d) => d.id));

  // Page 4: Cursor is deal-1 (null), should return empty
  const cursor3 = decodeCompletedCursor(encodeCompletedCursor(page3[page3.length - 1].closedAt, page3[page3.length - 1].id))!;
  const page4 = fetchPage(cursor3, pageSize);
  assert.deepEqual(page4, [], 'Page 4 is empty');

  // Verify complete set integrity: zero skips, zero duplicates
  assert.deepEqual(collected, ['deal-5', 'deal-4', 'deal-3', 'deal-2', 'deal-1']);
});

test('pipeline-cursor Finding 2 (Unit Simulation): Deleting a boundary record with closedAt=null preserves boundary and never leaks dated records', () => {
  const dataset = [
    { id: 'deal-5', closedAt: '2026-10-06T12:00:00.000Z' },
    { id: 'deal-4', closedAt: '2026-10-06T10:00:00.000Z' },
    { id: 'deal-3', closedAt: '2026-10-05T08:00:00.000Z' },
    { id: 'deal-2', closedAt: null }, // Page 2 ends here (cursor)
    { id: 'deal-1', closedAt: null },
  ];

  // Token is generated from deal-2 (which has closedAt: null)
  const token = encodeCompletedCursor(null, 'deal-2');
  const payload = decodeCompletedCursor(token)!;
  assert.equal(payload.version, 1);
  assert.equal(payload.closedAt, null);

  // CONCURRENT DELETION: deal-2 is deleted from DB!
  const datasetAfterDeletion = dataset.filter((d) => d.id !== 'deal-2');

  // Keyset query using buildCompletedKeysetWhere:
  const where = buildCompletedKeysetWhere(payload);
  assert.equal(where.closedAt, null, 'Must explicitly enforce closedAt: null');
  assert.deepEqual(where.id, { lt: 'deal-2' });

  // Filter against DB after deletion
  const nextRecords = datasetAfterDeletion.filter(
    (d) => d.closedAt === null && d.id < payload.id
  );

  // Assert it ONLY returns deal-1, NEVER leaks back deal-5, deal-4, or deal-3!
  assert.deepEqual(nextRecords.map((d) => d.id), ['deal-1']);
  assert.equal(nextRecords.some((d) => d.closedAt !== null), false, 'Zero dated records leaked');
});

test('pipeline-cursor Finding 2 (Service Test): getCompletedOpportunitiesCursor applies deterministic keyset without findUnique lookup', async () => {
  const { getCompletedOpportunitiesCursorForActor } = await import('@/lib/pipeline-cursor');
  const prisma = (await import('@/lib/prisma')).default;

  const originalFindUnique = prisma.opportunity.findUnique;
  const originalFindMany = prisma.opportunity.findMany;

  let findUniqueCalled = false;
  let findManyWhereClause: { AND?: unknown[] } | null = null;
  let findManyOrderBy: unknown = null;

  try {
    (prisma as unknown as { opportunity: { findUnique: unknown } }).opportunity.findUnique = async () => {
      findUniqueCalled = true;
      return null; // Simulate record was DELETED!
    };

    (prisma as unknown as { opportunity: { findMany: unknown } }).opportunity.findMany = async (args: {
      where?: { AND?: unknown[] };
      orderBy?: unknown;
    }) => {
      findManyWhereClause = args.where ?? null;
      findManyOrderBy = args.orderBy;
      return [
        {
          id: 'deal-remaining-1',
          topic: 'Remaining Deal',
          status: 'WON',
          closedAt: null,
          user: { name: 'Owner' },
          stage: { name: 'Won' },
        },
      ];
    };

    const adminActor = {
      id: 'admin-1',
      role: 'ADMIN' as const,
      departments: [],
    };

    // Encode a versioned cursor representing a deleted deal whose closedAt was null
    const cursor = encodeCompletedCursor(null, 'deal-deleted-null');

    // Call core service directly with actor
    const result = await getCompletedOpportunitiesCursorForActor(adminActor, cursor, undefined, 20);

    // 1. Assert that versioned cursor NEVER triggers findUnique database roundtrip
    assert.equal(findUniqueCalled, false, 'Versioned cursor must not make a findUnique database roundtrip');

    // 2. Assert that findMany received the exact keyset condition isolating null boundary
    const whereClause = findManyWhereClause as { AND?: unknown[] } | null;
    assert.ok(whereClause, 'findMany was called with whereClause');
    const andClauses = whereClause.AND;
    assert.ok(Array.isArray(andClauses), 'where.AND must be an array');

    type KeysetCandidate = { closedAt?: unknown; id?: { lt?: string } };
    const keysetClause = andClauses.find(
      (c): c is KeysetCandidate =>
        typeof c === 'object' &&
        c !== null &&
        'closedAt' in c &&
        (c as KeysetCandidate).closedAt === null &&
        Boolean((c as KeysetCandidate).id?.lt)
    );
    assert.ok(keysetClause, 'Keyset clause must enforce closedAt: null and id.lt');
    assert.equal(keysetClause.closedAt, null);
    assert.deepEqual(keysetClause.id, { lt: 'deal-deleted-null' });

    assert.deepEqual(findManyOrderBy, [
      { closedAt: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ], 'Production cursor ordering must match the NULLS LAST keyset contract');

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, 'deal-remaining-1');
  } finally {
    prisma.opportunity.findUnique = originalFindUnique;
    prisma.opportunity.findMany = originalFindMany;
  }
});
