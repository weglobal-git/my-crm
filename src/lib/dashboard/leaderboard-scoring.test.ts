import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateSalesXp,
  calculateNonSalesXp,
  rankItems,
  buildPodium,
  getCardHealthScoreFromRedRate,
  RED_RATE_LADDER,
} from './leaderboard-scoring';

test('getCardHealthScoreFromRedRate assigns fixed points according to 8-tier ladder', () => {
  // 0 cards = 0 XP
  assert.equal(getCardHealthScoreFromRedRate(0, 0).points, 0);

  // 0% red rate (< 1%) = 50 XP
  assert.equal(getCardHealthScoreFromRedRate(0, 5).points, 50);

  // < 1% = 50 XP
  assert.equal(getCardHealthScoreFromRedRate(0.8, 10).points, 50);

  // < 2% = 45 XP
  assert.equal(getCardHealthScoreFromRedRate(1.5, 10).points, 45);

  // < 3% = 40 XP
  assert.equal(getCardHealthScoreFromRedRate(2.4, 10).points, 40);

  // < 4% = 35 XP
  assert.equal(getCardHealthScoreFromRedRate(3.8, 10).points, 35);

  // < 5% = 30 XP (Target Met)
  assert.equal(getCardHealthScoreFromRedRate(4.8, 15).points, 30);
  assert.equal(getCardHealthScoreFromRedRate(4.8, 15).status, 'Target Met');

  // < 10% = 20 XP (Warning)
  assert.equal(getCardHealthScoreFromRedRate(5.0, 10).points, 20);
  assert.equal(getCardHealthScoreFromRedRate(7.5, 10).points, 20);

  // < 20% = 10 XP (Danger)
  assert.equal(getCardHealthScoreFromRedRate(15.0, 10).points, 10);

  // >= 20% = 0 XP (Critical / Cutoff)
  assert.equal(getCardHealthScoreFromRedRate(20.0, 10).points, 0);
  assert.equal(getCardHealthScoreFromRedRate(35.5, 10).points, 0);
});

test('calculateSalesXp aggregates 4 pillars: Card Health (50) + Clean Bonus (20) + LTC (20) + Quotation (10)', () => {
  // 0 cards held, 0 clean days, 0 team LTC, 0 team quotation = 0 XP
  const xpZero = calculateSalesXp(2, 50000, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.equal(xpZero, 0);

  // Perfect Card Health (<1% = 50 XP) + 15 clean days (15 XP) + 0 LTC + 8 quotes (8 XP) = 73 XP
  const xpGood = calculateSalesXp(2, 50000, 100, 10, 0, 5, 0, 0.5, 15, 0, 8, 8);
  assert.equal(xpGood, 73);

  // Maximum Cap Check: 50 XP (health) + 20 XP (clean) + 20 XP (ltc) + 10 XP (quote) = 100 XP
  const xpMax = calculateSalesXp(10, 500000, 100, 50, 0, 10, 0, 0, 25, 20, 15, 15);
  assert.equal(xpMax, 100);

  // Cutoff test: Red rate >= 20% gets 0 health XP, but keeps clean bonus and team quotes
  // 0 health + 10 clean days (10) + 0 LTC + 10 quotes (10) = 20 XP
  const xpRedCutoff = calculateSalesXp(2, 50000, 70, 10, 5, 10, 0, 25.0, 10, 0, 10, 10);
  assert.equal(xpRedCutoff, 20);
});

test('calculateNonSalesXp aggregates tasks, activity logs, assists, and events', () => {
  // 5 tasks (100) + 10 logs (50) + 2 assists (30) + 1 event (10) = 190
  const xp = calculateNonSalesXp(5, 10, 2, 1);
  assert.equal(xp, 190);
});

test('rankItems correctly sorts descending by score and assigns ranks 1, 2, 3', () => {
  const raw = [
    { userId: 'u1', name: 'Alice', score: 50, formattedValue: '50', unit: 'pts' },
    { userId: 'u2', name: 'Bob', score: 120, formattedValue: '120', unit: 'pts' },
    { userId: 'u3', name: 'Charlie', score: 80, formattedValue: '80', unit: 'pts' },
  ];

  const ranked = rankItems(raw);
  assert.equal(ranked[0].userId, 'u2');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].userId, 'u3');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[2].userId, 'u1');
  assert.equal(ranked[2].rank, 3);
});

test('buildPodium returns top 3 or null if fewer users', () => {
  const ranked = [
    { userId: 'u1', name: 'Alice', score: 100, formattedValue: '100', unit: 'pts', rank: 1 },
    { userId: 'u2', name: 'Bob', score: 50, formattedValue: '50', unit: 'pts', rank: 2 },
  ];

  const podium = buildPodium(ranked, 'xp', 'Overall MVP');
  assert.equal(podium.rank1?.name, 'Alice');
  assert.equal(podium.rank2?.name, 'Bob');
  assert.equal(podium.rank3, null);
});
