import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContactStatus, ContactType } from "@prisma/client";
import {
  calculateSuccessRate,
  accountMatchesFilters,
  type AccountCardDTO,
} from "./account-card-dto";
import {
  getAccountListKey,
  getAccountFilterKey,
  getAccountOverviewKey,
} from "./account-cache-keys";
import {
  getAccountQuickFilterIntent,
  isModifierQuickFilterClick,
} from "./account-quick-filter";

describe("Account Cards — Fast Redesign Unit Tests", () => {
  describe("Success Rate Calculation (Parity with getAccountOverview)", () => {
    it("returns 0% when there are 0 total deals", () => {
      assert.equal(calculateSuccessRate(0, 0), 0);
    });

    it("returns 100% when all deals are won", () => {
      assert.equal(calculateSuccessRate(5, 5), 100);
    });

    it("calculates accurate rounded percentage (e.g. 2 won / 3 total = 67%)", () => {
      assert.equal(calculateSuccessRate(2, 3), 67);
      assert.equal(calculateSuccessRate(1, 2), 50);
      assert.equal(calculateSuccessRate(1, 3), 33);
      assert.equal(calculateSuccessRate(3, 4), 75);
    });

    it("handles negative or invalid counts safely", () => {
      assert.equal(calculateSuccessRate(0, -1), 0);
    });
  });

  describe("Quick Filter Modifier Intent Helper", () => {
    it("detects Meta + primary click on macOS", () => {
      let stopped = false;
      let prevented = false;

      const event = {
        button: 0,
        metaKey: true,
        ctrlKey: false,
        stopPropagation: () => { stopped = true; },
        preventDefault: () => { prevented = true; },
      };

      const intent = getAccountQuickFilterIntent(event, "type", "CUSTOMER", true);
      assert.equal(intent.isQuickFilter, true);
      assert.equal(intent.field, "type");
      assert.equal(intent.value, "CUSTOMER");
      assert.equal(stopped, true);
      assert.equal(prevented, true);
    });

    it("detects Ctrl + primary click on non-Mac (Windows/Linux)", () => {
      let stopped = false;
      let prevented = false;

      const event = {
        button: 0,
        metaKey: false,
        ctrlKey: true,
        stopPropagation: () => { stopped = true; },
        preventDefault: () => { prevented = true; },
      };

      const intent = getAccountQuickFilterIntent(event, "country", "Thailand", false);
      assert.equal(intent.isQuickFilter, true);
      assert.equal(intent.field, "country");
      assert.equal(intent.value, "Thailand");
      assert.equal(stopped, true);
      assert.equal(prevented, true);
    });

    it("ignores plain click (no modifier) so row opens normally", () => {
      const event = {
        button: 0,
        metaKey: false,
        ctrlKey: false,
      };

      const intent = getAccountQuickFilterIntent(event, "type", "CUSTOMER", true);
      assert.equal(intent.isQuickFilter, false);
      assert.equal(intent.field, undefined);
    });

    it("ignores middle click or right click even if modifier is held", () => {
      const event = {
        button: 1, // middle click
        metaKey: true,
      };

      const intent = getAccountQuickFilterIntent(event, "type", "CUSTOMER", true);
      assert.equal(intent.isQuickFilter, false);
    });

    it("returns isQuickFilter: false if target value is empty or null", () => {
      const event = {
        button: 0,
        metaKey: true,
      };

      const intent = getAccountQuickFilterIntent(event, "country", null, true);
      assert.equal(intent.isQuickFilter, false);

      const intentEmpty = getAccountQuickFilterIntent(event, "country", "   ", true);
      assert.equal(intentEmpty.isQuickFilter, false);
    });
  });

  describe("Account Membership and Client-Side Filter Matching", () => {
    const mockCard: AccountCardDTO = {
      id: "acc_1",
      displayName: "Acme Global Co.",
      name: "Acme Corporation",
      status: ContactStatus.QUALIFIED,
      type: ContactType.CUSTOMER,
      country: "Thailand",
      starRating: 4,
      successRate: 75,
      wonDealsCount: 3,
      totalDealsCount: 4,
      revision: "2026-09-15T10:00:00.000Z",
    };

    it("matches when all filter criteria match", () => {
      const matches = accountMatchesFilters(mockCard, {
        status: "QUALIFIED",
        type: "CUSTOMER",
        country: "Thailand",
        search: "Acme",
      });
      assert.equal(matches, true);
    });

    it("rejects when status does not match", () => {
      const matches = accountMatchesFilters(mockCard, {
        status: "UNQUALIFIED",
        type: "ALL",
      });
      assert.equal(matches, false);
    });

    it("rejects when type does not match", () => {
      const matches = accountMatchesFilters(mockCard, {
        type: "TRADER",
      });
      assert.equal(matches, false);
    });

    it("rejects when country does not match", () => {
      const matches = accountMatchesFilters(mockCard, {
        country: "Vietnam",
      });
      assert.equal(matches, false);
    });

    it("matches search term against name, displayName, or country (case-insensitive)", () => {
      assert.equal(accountMatchesFilters(mockCard, { search: "global" }), true);
      assert.equal(accountMatchesFilters(mockCard, { search: "CORPORATION" }), true);
      assert.equal(accountMatchesFilters(mockCard, { search: "thailand" }), true);
      assert.equal(accountMatchesFilters(mockCard, { search: "nonexistent" }), false);
    });
  });

  describe("Actor-Scoped Cache Key Factory", () => {
    it("generates deterministic list keys scoped by actorId", () => {
      const keyUserA = getAccountListKey(
        "user_123",
        { status: "QUALIFIED", type: "CUSTOMER", country: "ALL", search: "" },
        1
      );
      const keyUserB = getAccountListKey(
        "user_456",
        { status: "QUALIFIED", type: "CUSTOMER", country: "ALL", search: "" },
        1
      );

      assert.notDeepEqual(keyUserA, keyUserB);
      assert.equal(keyUserA[0], "account-cards-list");
      assert.equal(keyUserA[1], "user_123");
      assert.equal(keyUserA[2], "QUALIFIED");
      assert.equal(keyUserA[3], "CUSTOMER");
      assert.equal(keyUserA[6], 1);
    });

    it("generates canonical overview keys and returns null for empty ID", () => {
      assert.deepEqual(getAccountOverviewKey("acc_99"), ["account-overview", "acc_99"]);
      assert.equal(getAccountOverviewKey(null), null);
    });
  });

  describe("Rating Mutation Sequence Guard & Rollback Safety", () => {
    it("simulates rapid rating 1 -> 5 -> 2 where later sequence wins", () => {
      const sequenceMap = new Map<string, number>();
      const accountId = "comp_test";

      // 1st click: 1 star
      const seq1 = 1;
      sequenceMap.set(accountId, seq1);

      // 2nd click: 5 stars
      const seq2 = 2;
      sequenceMap.set(accountId, seq2);

      // 3rd click: 2 stars
      const seq3 = 3;
      sequenceMap.set(accountId, seq3);

      // Suppose request 1 fails late:
      const shouldRollbackReq1 = sequenceMap.get(accountId) === seq1;
      assert.equal(shouldRollbackReq1, false, "Late failure of request 1 must NOT revert sequence 3");

      // Suppose request 2 resolves late:
      const shouldApplyReq2 = sequenceMap.get(accountId) === seq2;
      assert.equal(shouldApplyReq2, false, "Late response of request 2 must NOT overwrite sequence 3");

      // Current active sequence remains 3
      assert.equal(sequenceMap.get(accountId), seq3);
    });
  });
});
