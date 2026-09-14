# Dashboard Overview implementation checkpoint

Last updated: 2026-09-14

## Objective

Implement `plans/dashboard-overview-sales-plan.md` in verified vertical slices while preserving unrelated working-tree changes.

## Current status

- Slice 0: COMPLETED — pure Bangkok period and sales aggregation contracts, YoY and share calculations with 100% passing tests.
- Slice 1: COMPLETED — additive `CompanySaleTarget` Prisma model, migration, server actions with `CompanyLog` audit, and dedicated `SaleTargetTab` component integrated in `EditAccountPanel`.
- Slice 2: COMPLETED — shared `DashboardToolbar` (desktop + mobile), `MonthlySalesReport`, `MonthlyDealDrawer`, and `SalesSummarySection` with scoped snapshot DTO.
- Slice 3: COMPLETED — `SaleTrackingGrid` with accessible flat gauges, customizable sort options, zero-target and multi-currency handling.
- Slice 4: COMPLETED — `AnnualSalesReportTable` with 5-year matrix, sticky desktop column, % share, and YoY `New`/`+X%`/`-X%` badges.
- Slice 5: COMPLETED — `DashboardOverviewView` integration, stale data retention, documentation in `pusher-management.md`, and full verification passed.

## Changed files owned by this work

- `prisma/schema.prisma`
- `prisma/migrations/20260914120000_add_company_sale_targets/migration.sql`
- `src/lib/prisma.ts`
- `src/lib/menu-registry.ts`
- `src/lib/dashboard/sales-overview.ts`
- `src/lib/dashboard/sales-overview.test.ts`
- `src/lib/dashboard/dashboard-data.ts`
- `src/lib/dashboard/dashboard-data.test.ts`
- `src/lib/actions/sales-target.ts`
- `src/lib/actions/sales-target.test.ts`
- `src/components/contact/SaleTargetTab.tsx`
- `src/components/contact/EditAccountPanel.tsx`
- `src/components/dashboard/DashboardToolbar.tsx`
- `src/components/dashboard/MonthlyDealDrawer.tsx`
- `src/components/dashboard/MonthlySalesReport.tsx`
- `src/components/dashboard/SaleTrackingGrid.tsx`
- `src/components/dashboard/AnnualSalesReportTable.tsx`
- `src/components/dashboard/SalesSummarySection.tsx`
- `src/components/dashboard/DashboardOverviewView.tsx`
- `src/app/dashboard/overview/page.tsx`
- `src/app/dashboard/overview/loading.tsx`
- `.agents/skills/pusher-management/references/pusher-management.md`
- `plans/dashboard-overview-implementation-checkpoint.md`

Unrelated Calendar working-tree changes are fully preserved and verified against the calendar test suite.

## Verification recorded

- `npx prisma validate`: Schema valid.
- `npx prisma generate`: Prisma client generated.
- `npx tsc --noEmit`: 0 errors.
- `node --import tsx --test src/lib/dashboard/*.test.ts src/lib/actions/sales-target.test.ts`: 11/11 tests passed.
- `npm run test:calendar`: 62/62 tests passed (0 failures).
- `npm run verify:pipeline`: 63/63 tests passed, 0 TypeScript errors.

## Decisions

- Sales attribution uses `goodsLoadingDate` and Bangkok calendar boundaries.
- Monthly Total includes only OPEN + WON sales deals in the selected loading month.
- Currencies remain separate (THB, USD, EUR, CNY); no implicit FX conversion.
- Dashboard route access requires `crm_overview`; Sale Summary, Sale Tracking, and Annual Sale Report each require their dedicated `dashboard.*` right-menu permission and are independently redacted server-side.
- Dashboard aggregate reuses Pipeline actor data scope (`getOpportunityAccessWhere`) without requiring permission to open the Pipeline page: Admin sees all deals, Management sees department-owned/team deals, and General users see deals they own or join as team members.
- Non-admin Sale Tracking targets are limited to accounts that have at least one opportunity inside the same deal-access scope.
- Registry sync completed in `/system/permissions`; all three new report permissions default to unchecked for existing departments until an admin assigns them.
- Sale Target mutation requires `contact.sale_target` server permission and writes audit to `CompanyLog` in the same transaction.
- UI adheres strictly to CRM Design System: flat dark UI, `#252728` background, `#3A3B3C` cards, `#4E4F50` borders, `#C7F33C` accent, no box shadows, no gradients.
