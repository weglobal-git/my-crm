# Event AI Agent — Live Schema Read-only Audit

> Date: 2026-09-02  
> Operation: Read-only  
> Database mutation: None

## Redacted target

```text
provider: PostgreSQL / Neon
host: ep-cool-fog-azf2byax-pooler.c-3.ap-southeast-1.aws.neon.tech
database: neondb
sslmode: require
DIRECT_URL: not configured
```

Credentials were not printed or stored in this report.

## Result

`prisma db pull --print` completed successfully. An exact Prisma migration diff from the live datasource to the preserved pre-Event-AI baseline returned:

```text
No difference detected.
exit code: 0
```

Therefore the current live schema matches the offline baseline used to generate:

- `20260902000000_baseline_existing_schema`
- `20260902001000_add_event_ledger_foundation`

## Remaining uncertainty

The pooled endpoint name and local environment do not identify whether this is production, staging, or a Neon preview branch. No Neon API key or `DIRECT_URL` is configured, so this task cannot safely create or identify a branch through the Neon API.

## Safety decision

- Do not run baseline SQL against this endpoint.
- Do not run `migrate resolve`, `migrate deploy`, `db push`, or the additive SQL against this endpoint until its environment/branch ownership is explicitly confirmed.
- Continue with database-independent code/tests and disabled feature flags.
