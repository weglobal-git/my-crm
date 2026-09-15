export type QuickFilterField = "type" | "country";

export interface QuickFilterEventLike {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export interface QuickFilterIntentResult {
  isQuickFilter: boolean;
  field?: QuickFilterField;
  value?: string;
}

/**
 * Checks whether an event matches the platform-specific modifier click:
 * - Primary mouse button (button === 0, or undefined for synthetic click events)
 * - Meta key on macOS
 * - Ctrl key on Windows/Linux (or Meta/Ctrl when platform is undefined)
 */
export function isModifierQuickFilterClick(
  event: QuickFilterEventLike,
  platformIsMac?: boolean
): boolean {
  if (event.button !== undefined && event.button !== 0) {
    return false;
  }

  const isMac =
    platformIsMac !== undefined
      ? platformIsMac
      : typeof navigator !== "undefined" &&
        /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);

  if (isMac) {
    return Boolean(event.metaKey);
  }
  return Boolean(event.ctrlKey);
}

/**
 * Pure helper to extract quick-filter intent from a user click on an Account Type or Country badge.
 * If a modifier click is detected, stops propagation and returns the intent.
 */
export function getAccountQuickFilterIntent(
  event: QuickFilterEventLike,
  field: QuickFilterField,
  value: string | null | undefined,
  platformIsMac?: boolean
): QuickFilterIntentResult {
  if (!value || !value.trim()) {
    return { isQuickFilter: false };
  }

  if (isModifierQuickFilterClick(event, platformIsMac)) {
    event.preventDefault?.();
    event.stopPropagation?.();
    return {
      isQuickFilter: true,
      field,
      value: value.trim(),
    };
  }

  return { isQuickFilter: false };
}
