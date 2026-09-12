"use client";

import { useEffect, useState } from 'react';

export const CALENDAR_PANEL_TRANSITION_MS = 300;

/** Keeps a calendar drawer mounted long enough to play the same enter/exit
 * transition used by EditDealPanel. */
export function useCalendarPanelTransition(isOpen: boolean) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  if (isOpen && !shouldRender) {
    setShouldRender(true);
  }

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let unmountTimer: ReturnType<typeof setTimeout> | undefined;

    if (isOpen) {
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      firstFrame = requestAnimationFrame(() => {
        setIsVisible(false);
      });
      unmountTimer = setTimeout(() => setShouldRender(false), CALENDAR_PANEL_TRANSITION_MS);
    }

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, [isOpen]);

  return { shouldRender, isVisible };
}

export function calendarPanelBackdropClass(isVisible: boolean) {
  return `calendar-dialog-backdrop bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
    isVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
  }`;
}

export function calendarPanelMotionClass(isVisible: boolean) {
  return `calendar-dialog transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] md:origin-right ${
    isVisible
      ? 'translate-y-0 scale-100 opacity-100 md:translate-x-0'
      : 'pointer-events-none translate-y-4 scale-[0.97] opacity-0 md:translate-x-8 md:translate-y-0'
  }`;
}
