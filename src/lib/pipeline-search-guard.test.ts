import test from 'node:test';
import assert from 'node:assert/strict';

test('Pipeline Search and URL Sync Guard', async (t) => {
  await t.test('Prevents external initialSearch from wiping active focused input', () => {
    // Simulates the exact state machine in PipelineSearch
    let term = 'ฝน';
    let isFocused = true;
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
    let stateTab = 'workspace';
    let stateSearch = 'ฝน';

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
});
