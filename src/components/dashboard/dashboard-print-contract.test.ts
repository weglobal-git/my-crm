import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overviewSource = readFileSync(
  new URL("./DashboardOverviewView.tsx", import.meta.url),
  "utf8"
);
const reportSource = readFileSync(
  new URL("./DashboardPrintReport.tsx", import.meta.url),
  "utf8"
);
const globalCssSource = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8"
);

test("print preview waits for the lazy report to mount", () => {
  assert.match(reportSource, /useLayoutEffect\(\(\) => \{\s*onReady\?\.\(\)/);
  assert.match(overviewSource, /snapshot && isPrinting/);
  assert.match(overviewSource, /document\.fonts\?\.ready/);
  assert.doesNotMatch(overviewSource, /setTimeout\(\(\) => \{\s*window\.print\(\)/);
});

test("global print styles keep the report header visible", () => {
  assert.match(reportSource, /print-report-header/);
  assert.match(globalCssSource, /header:not\(\.print-report-header\)/);
});

test("print report supports independent map and summary periods", () => {
  assert.match(reportSource, /worldMapPeriod: "all_time" \| "year" \| "month"/);
  assert.match(reportSource, /saleSummaryPeriod: "year" \| "month"/);
  assert.match(reportSource, /snapshot\.worldMap\.selectedMonth/);
  assert.match(reportSource, /sections\.saleSummaryPeriod === "year" \? snapshot\.yearly : snapshot\.monthly/);
});

test("print tables use one rounded frame without doubled outer borders", () => {
  assert.match(reportSource, /print-table-frame/);
  assert.match(reportSource, /print-data-table/);
  assert.match(globalCssSource, /border-collapse: separate !important/);
  assert.match(globalCssSource, /tbody tr:last-child > td/);
  assert.match(globalCssSource, /#dashboard-print-report \{[\s\S]*?border: 0 !important/);
});
