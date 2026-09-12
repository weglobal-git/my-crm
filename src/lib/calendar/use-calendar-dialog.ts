"use client";

import { useEffect, useRef, type RefObject } from 'react';

const dialogStack: symbol[] = [];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useCalendarDialog(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const id = Symbol('calendar-dialog');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(id);
    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current || containerRef.current?.querySelector<HTMLElement>(FOCUSABLE) || containerRef.current;
      target?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== id) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const focusable = [...containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      const index = dialogStack.lastIndexOf(id);
      if (index >= 0) dialogStack.splice(index, 1);
      previouslyFocused?.focus();
    };
  }, [containerRef, initialFocusRef, isOpen]);
}
