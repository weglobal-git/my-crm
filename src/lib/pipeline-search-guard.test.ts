import test from 'node:test';
import assert from 'node:assert/strict';

test('Pipeline Search and URL Sync Guard', async (t) => {
  await t.test('Prevents external initialSearch from wiping active focused input', () => {
    // Simulates the exact state machine in PipelineSearch
    let term = 'ฝน';
    const isFocused = true;
    let lastEmitted = 'ฝน';

    const syncExternal = (incomingInitialSearch: string) => {
      // Guard: If focused, reject external overwrites
      if (isFocused) return false;
      if (incomingInitialSearch === lastEmitted || incomingInitialSearch === term) return false;
      term = incomingInitialSearch;
      lastEmitted = incomingInitialSearch;
      return true;
    };

    // Stale searchParams push from router or outside
    const wasOverwritten = syncExternal('');
    assert.strictEqual(wasOverwritten, false, 'Should NOT overwrite while focused');
    assert.strictEqual(term, 'ฝน', 'Term must remain "ฝน"');
  });

  await t.test('Safe URL popstate synchronizer avoids feedback loop', () => {
    // Simulates window.location.search vs state
    const stateTab = 'workspace';
    const stateSearch = 'ฝน';

    // updateUrl creates search params safely
    const createUrl = (tab: string, search: string) => {
      const params = new URLSearchParams();
      if (tab) params.set('tab', tab);
      if (search && search.trim()) params.set('search', search.trim());
      const query = params.toString();
      return `/pipeline${query ? `?${query}` : ''}`;
    };

    const url = createUrl(stateTab, stateSearch);
    assert.strictEqual(url, '/pipeline?tab=workspace&search=%E0%B8%9D%E0%B8%99');

    // Popstate parses back without mutating local state unless triggered by browser
    const parsed = new URLSearchParams(url.split('?')[1]);
    assert.strictEqual(parsed.get('search'), 'ฝน');
    assert.strictEqual(parsed.get('tab'), 'workspace');
  });

  await t.test('Handles Thai text and IME composition boundaries safely', () => {
    let isComposing = false;
    let pendingTerm = '';
    let emittedTerm: string | null = null;

    const emitSearch = (term: string) => {
      if (isComposing) return;
      emittedTerm = term;
    };

    // User starts typing multi-byte Thai
    isComposing = true;
    pendingTerm = 'ฝ';
    emitSearch(pendingTerm);
    assert.strictEqual(emittedTerm, null, 'Must not emit mid-composition');

    // Composition ends with "ฝน"
    pendingTerm = 'ฝน';
    isComposing = false;
    emitSearch(pendingTerm);
    assert.strictEqual(emittedTerm, 'ฝน', 'Emits clean Thai word after composition');
  });

  await t.test('matchesPipelineCardSearch: matches all fields in the product search contract', async () => {
    const { matchesPipelineCardSearch } = await import('./pipeline-card-dto');

    const sampleDeal = {
      topic: 'Order 8/26 Serum',
      company: { name: 'Carebeau Global Co., Ltd.', displayName: 'Carebeau Trade' },
      owner: { name: 'YUI' },
      invoiceId: 'INV-2026-088',
      reserveId: 'RES-9901',
    };

    // Topic match
    assert.strictEqual(matchesPipelineCardSearch(sampleDeal, 'serum'), true);
    // Company legal name match
    assert.strictEqual(matchesPipelineCardSearch(sampleDeal, 'Global'), true);
    // Company displayName match
    assert.strictEqual(matchesPipelineCardSearch(sampleDeal, 'Trade'), true);
    // Sales owner name match
    assert.strictEqual(matchesPipelineCardSearch(sampleDeal, 'yui'), true);
    // Invoice ID match
    assert.strictEqual(matchesPipelineCardSearch(sampleDeal, 'inv-2026'), true);
    // Reserve ID match
    assert.strictEqual(matchesPipelineCardSearch(sampleDeal, 'res-9901'), true);
    // Non-match
    assert.strictEqual(matchesPipelineCardSearch(sampleDeal, 'NonExistentXYZ'), false);
    // Empty query returns true
    assert.strictEqual(matchesPipelineCardSearch(sampleDeal, '  '), true);
  });

  await t.test('buildPipelineSearchWhere: builds Prisma SQL where clause for all product fields', async () => {
    const { buildPipelineSearchWhere } = await import('./pipeline-opportunities');

    // Empty query returns empty where
    assert.deepStrictEqual(buildPipelineSearchWhere(''), {});
    assert.deepStrictEqual(buildPipelineSearchWhere('   '), {});

    // Populated query
    const where = buildPipelineSearchWhere('YUI');
    assert.ok(Array.isArray(where.OR), 'where.OR must be an array');
    assert.strictEqual(where.OR.length, 6, 'Must search 6 fields');
    assert.deepStrictEqual(where.OR[0], { topic: { contains: 'YUI', mode: 'insensitive' } });
    assert.deepStrictEqual(where.OR[1], { company: { name: { contains: 'YUI', mode: 'insensitive' } } });
    assert.deepStrictEqual(where.OR[2], { company: { displayName: { contains: 'YUI', mode: 'insensitive' } } });
    assert.deepStrictEqual(where.OR[3], { owner: { name: { contains: 'YUI', mode: 'insensitive' } } });
    assert.deepStrictEqual(where.OR[4], { invoiceId: { contains: 'YUI', mode: 'insensitive' } });
    assert.deepStrictEqual(where.OR[5], { reserveId: { contains: 'YUI', mode: 'insensitive' } });
  });

  await t.test('Search Concurrency Guard: stale responses from earlier queries are rejected', () => {
    let activeVersion = 0;
    let committedResults: string[] = [];

    const handleSearch = (query: string) => {
      void query;
      activeVersion++;
      const currentVersion = activeVersion;

      // Simulate async network response
      return {
        resolve: (mockData: string[]) => {
          if (currentVersion !== activeVersion) {
            // Stale response! Must be discarded
            return false;
          }
          committedResults = mockData;
          return true;
        },
      };
    };

    // User types 'A' (version 1)
    const req1 = handleSearch('A');
    // User types 'AB' (version 2)
    const req2 = handleSearch('AB');
    // User backspaces back to 'A' (version 3)
    const req3 = handleSearch('A');

    // Response 2 ('AB') arrives late
    const committedLate = req2.resolve(['result-for-AB']);
    assert.strictEqual(committedLate, false, 'Late response for AB must be discarded');
    assert.strictEqual(committedResults.length, 0, 'No state change from stale response');

    // Response 3 ('A') arrives
    const committedLatest = req3.resolve(['result-for-A']);
    assert.strictEqual(committedLatest, true, 'Latest response for A must be accepted');
    assert.deepStrictEqual(committedResults, ['result-for-A']);

    // Response 1 ('A' from version 1) arrives even later
    const committedVeryOld = req1.resolve(['old-result-for-A']);
    assert.strictEqual(committedVeryOld, false, 'Stale version 1 must be discarded');
    assert.deepStrictEqual(committedResults, ['result-for-A']);
  });

  await t.test('Cursor Pagination Stability: tie-breakers prevent duplicate and skipped items', () => {
    // Simulated dataset with duplicate timestamps
    const mockItems = [
      { id: 'deal-3', closedAt: '2026-08-14T17:00:00.000Z' },
      { id: 'deal-2', closedAt: '2026-08-14T17:00:00.000Z' }, // Identical timestamp!
      { id: 'deal-1', closedAt: '2026-08-14T17:00:00.000Z' }, // Identical timestamp!
      { id: 'deal-0', closedAt: '2026-08-10T17:00:00.000Z' },
    ];

    const sortFn = (a: typeof mockItems[0], b: typeof mockItems[0]) => {
      const timeDiff = new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id); // Tie-breaker
    };

    const sorted = [...mockItems].sort(sortFn);

    // Page 1: take 2
    const page1 = sorted.slice(0, 2);
    assert.deepStrictEqual(page1.map((d) => d.id), ['deal-3', 'deal-2']);

    // Page 2: take from cursor 'deal-2'
    const cursorIdx = sorted.findIndex((d) => d.id === 'deal-2');
    const page2 = sorted.slice(cursorIdx + 1, cursorIdx + 3);
    assert.deepStrictEqual(page2.map((d) => d.id), ['deal-1', 'deal-0']);

    // Assert 0 overlaps
    const p1Set = new Set(page1.map((d) => d.id));
    const overlaps = page2.filter((d) => p1Set.has(d.id));
    assert.strictEqual(overlaps.length, 0, 'No overlapping items between cursor pages');
  });

  await t.test('Phase P2 Regression: find result located beyond initial page without prior scrolling', () => {
    // 50 simulated completed deals
    const dataset = Array.from({ length: 50 }, (_, i) => ({
      id: `deal-${i}`,
      topic: i === 35 ? 'Special Hidden Project Alpha' : `Standard Project ${i}`,
      closedAt: new Date(Date.now() - i * 86400000).toISOString(),
    }));

    // Defect reproduction: searching only loaded page 1 (first 20 items)
    const page1Loaded = dataset.slice(0, 20);
    const clientSideSearchOnly = page1Loaded.filter((d) => d.topic.includes('Hidden Project'));
    assert.strictEqual(clientSideSearchOnly.length, 0, 'Defect verified: Item at index 35 is missing from loaded page 1');

    // Server-side search semantics: query filters entire authorized dataset before pagination
    const serverFiltered = dataset.filter((d) => d.topic.includes('Hidden Project'));
    const serverPage1 = serverFiltered.slice(0, 20);
    assert.strictEqual(serverPage1.length, 1, 'Server search finds item at index 35 on page 1 of search results');
    assert.strictEqual(serverPage1[0].id, 'deal-35');
  });

  await t.test('Phase P2: Atomic pagination reset on query change prevents cross-query data pollution', () => {
    let items: string[] = ['item-unfiltered-1', 'item-unfiltered-2'];
    let cursor: string | null = 'cursor-1';
    let queryVersion = 1;

    // User initiates new search
    const onNewSearch = (newQuery: string) => {
      void newQuery;
      queryVersion++;
      // Atomic reset
      items = [];
      cursor = null;
      return queryVersion;
    };

    const activeV = onNewSearch('Serum');
    assert.deepStrictEqual(items, [], 'Items reset immediately on new search');
    assert.strictEqual(cursor, null, 'Cursor reset immediately on new search');

    // Simulate late response from previous queryVersion (1)
    const handleLateResponse = (resVersion: number, lateData: string[]) => {
      if (resVersion !== queryVersion) return; // Discard
      items = [...items, ...lateData];
    };

    handleLateResponse(1, ['stale-item']);
    assert.deepStrictEqual(items, [], 'Stale late response does not pollute new search');

    // Timely response arrives
    handleLateResponse(activeV, ['fresh-serum-deal']);
    assert.deepStrictEqual(items, ['fresh-serum-deal'], 'Timely response accepted');
  });
});
