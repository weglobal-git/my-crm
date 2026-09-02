import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_ACTIVITY_WHERE,
  ACTIVE_OPPORTUNITY_WHERE,
  activeActivityTreeWhere,
  activeActivityWhere,
  activeOpportunityWhere,
  activeRepliesRelation,
  isActiveRecord,
} from "./query-scopes";

test("empty scopes exclude soft-deleted records", () => {
  assert.deepEqual(activeOpportunityWhere(), { deletedAt: null });
  assert.deepEqual(activeActivityWhere(), { deletedAt: null });
  assert.equal(Object.isFrozen(ACTIVE_OPPORTUNITY_WHERE), true);
  assert.equal(Object.isFrozen(ACTIVE_ACTIVITY_WHERE), true);
});

test("existing filters are composed with AND and cannot override active scope", () => {
  assert.deepEqual(activeOpportunityWhere({ status: "OPEN", deletedAt: { not: null } }), {
    AND: [
      { deletedAt: null },
      { status: "OPEN", deletedAt: { not: null } },
    ],
  });
  assert.deepEqual(activeActivityWhere({ opportunityId: "deal-1", type: "COMMENT" }), {
    AND: [
      { deletedAt: null },
      { opportunityId: "deal-1", type: "COMMENT" },
    ],
  });
});

test("activity tree scopes both parents and nested replies", () => {
  assert.deepEqual(activeActivityTreeWhere("deal-1"), {
    AND: [
      { deletedAt: null },
      { opportunityId: "deal-1", parentId: null },
    ],
  });
  assert.deepEqual(activeRepliesRelation(), { where: { deletedAt: null } });
  assert.throws(() => activeActivityTreeWhere("  "), /dealId/);
});

test("post-read active guard fails closed for missing and deleted records", () => {
  assert.equal(isActiveRecord({ deletedAt: null }), true);
  assert.equal(isActiveRecord({ deletedAt: new Date() }), false);
  assert.equal(isActiveRecord(null), false);
  assert.equal(isActiveRecord(undefined), false);
});
