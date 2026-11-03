export type ActionFailure = {
  ok: false;
  error: string;
  code?: string;
};

export type ActionSuccess<T> = {
  ok: true;
  data: T;
};

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export class ContactActionError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ContactActionError";
    this.code = code;
  }
}

export function actionOk<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function actionFail(error: string, code?: string): ActionFailure {
  return { ok: false, error, ...(code ? { code } : {}) };
}

export function isActionFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

/**
 * Unwraps an ActionResult<T> on the client. Because any throw here executes
 * in browser JavaScript (after the Server Action response has arrived), Next.js
 * React Flight never redacts the error message into Minified React error #441.
 */
export function unwrapActionResult<T>(result: ActionResult<T>): T {
  if (isActionFailure(result)) {
    throw new ContactActionError(result.error, result.code);
  }
  return result.data;
}

const REDACTED_FLIGHT_ERROR_PATTERNS = [
  "Minified React error #441",
  "react.dev/errors/441",
  "An error occurred in the Server Components render",
];

/**
 * Converts any thrown client/server error into a clean, readable user message,
 * preventing cryptic React Flight #441 messages from ever appearing in UI toasts.
 */
export function getReadableActionError(
  err: unknown,
  fallback = "Unable to complete request. Please try again."
): string {
  if (isActionFailure(err)) {
    return err.error || fallback;
  }

  if (err instanceof Error) {
    const raw = (err.message || "").trim();
    if (!raw) return fallback;

    if (
      raw.includes("Failed to find Server Action") ||
      raw.includes("Server Action") && raw.includes("was not found")
    ) {
      return "The application was recently updated. Please refresh the page and try again.";
    }

    if (REDACTED_FLIGHT_ERROR_PATTERNS.some((pattern) => raw.includes(pattern))) {
      const digest = (err as Error & { digest?: string }).digest;
      return digest
        ? `${fallback} (Error ref: ${digest})`
        : `${fallback} Please check your connection or refresh the page.`;
    }

    return raw;
  }

  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }

  return fallback;
}

/**
 * Detects whether a phone or email value contains department-masking asterisks (`***`).
 */
export function containsMaskedPlaceholder(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.includes("***") || /^\*+$/.test(value.trim());
}

/**
 * Strips email and phone fields from a contact update payload when the contact
 * is department-masked (or if masked placeholder strings slipped into the form),
 * preventing cross-department edits from corrupting real emails/phones in DB.
 */
export function sanitizeContactContactabilityInput<
  T extends {
    email?: string | null;
    phone?: string | null;
    emails?: string[];
    phones?: string[];
  },
>(input: T, isMasked: boolean): T {
  const next = { ...input };

  if (isMasked) {
    delete next.email;
    delete next.phone;
    delete next.emails;
    delete next.phones;
    return next;
  }

  if (next.emails !== undefined) {
    const filteredEmails = next.emails.filter((e) => !containsMaskedPlaceholder(e));
    if (filteredEmails.length !== next.emails.length) {
      delete next.emails;
      if (containsMaskedPlaceholder(next.email)) {
        delete next.email;
      }
    }
  } else if (containsMaskedPlaceholder(next.email)) {
    delete next.email;
  }

  if (next.phones !== undefined) {
    const filteredPhones = next.phones.filter((p) => !containsMaskedPlaceholder(p));
    if (filteredPhones.length !== next.phones.length) {
      delete next.phones;
      if (containsMaskedPlaceholder(next.phone)) {
        delete next.phone;
      }
    }
  } else if (containsMaskedPlaceholder(next.phone)) {
    delete next.phone;
  }

  return next;
}

/**
 * Determines whether a first-page account query can reuse cached status totals
 * instead of executing a separate `prisma.company.count({ where })` query.
 * Must return FALSE whenever search, single type/country, OR multi-select
 * types/countries filters are active.
 */
export function isUnfilteredAccountStatusQuery(params: {
  page?: number;
  search?: string;
  type?: string;
  types?: string[];
  country?: string;
  countries?: string[];
}): boolean {
  const isFirstPage = (params.page ?? 1) === 1;
  if (!isFirstPage) return false;
  if (params.search && params.search.trim().length > 0) return false;
  if (params.type && params.type !== "ALL") return false;
  if (params.types && params.types.length > 0) return false;
  if (params.country && params.country.trim() !== "" && params.country !== "ALL") return false;
  if (params.countries && params.countries.length > 0) return false;
  return true;
}

