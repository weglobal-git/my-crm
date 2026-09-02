export type EventLedgerFeatureFlags = {
  writeEnabled: boolean;
  strictMode: boolean;
  aiEnqueueEnabled: boolean;
  softDeleteEnabled: boolean;
};

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

function readBooleanFlag(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function getEventLedgerFeatureFlags(
  env: EnvironmentValues = process.env,
): EventLedgerFeatureFlags {
  return {
    writeEnabled: readBooleanFlag(env.EVENT_LEDGER_WRITE_ENABLED),
    strictMode: readBooleanFlag(env.EVENT_LEDGER_STRICT_MODE),
    aiEnqueueEnabled: readBooleanFlag(env.EVENT_AI_ENQUEUE_ENABLED),
    softDeleteEnabled: readBooleanFlag(env.EVENT_SOFT_DELETE_ENABLED),
  };
}
