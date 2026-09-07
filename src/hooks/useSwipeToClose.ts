"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface UseSwipeToCloseOptions {
  onClose: () => void;
  isOpen: boolean;
  minDistance?: number;
  velocityThreshold?: number;
}

/**
 * Custom hook providing touch swipe-to-close (left-to-right) for mobile view panels.
 * Ensures vertical scrolling inside the panel is completely uninterrupted.
 */
export function useSwipeToClose({
  onClose,
  isOpen,
  minDistance = 70,
  velocityThreshold = 0.3,
}: UseSwipeToCloseOptions) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setIsDismissed(false);
      setDragOffset(0);
    }
  }

  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const intentLocked = useRef<"horizontal" | "vertical" | null>(null);
  const isClosingRef = useRef(false);

  // When panel closes, allow exit transitions (300ms) to complete before resetting
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setIsDismissed(false);
        setDragOffset(0);
        isClosingRef.current = false;
      }, 350);
      return () => clearTimeout(timer);
    } else {
      isClosingRef.current = false;
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only active on mobile view (< 768px)
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    if (isClosingRef.current) return;

    // Ignore if touch started on an input, textarea or contenteditable element
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    if (e.touches.length !== 1) return;

    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startTime.current = Date.now();
    intentLocked.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    if (isClosingRef.current) return;
    if (e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX.current;
    const diffY = Math.abs(currentY - startY.current);

    // Determine swipe intent on initial movement
    if (!intentLocked.current) {
      if (diffX > 8 && diffX > diffY * 1.1) {
        intentLocked.current = "horizontal";
        setIsDragging(true);
      } else if (diffY > 8 || diffX < -8) {
        intentLocked.current = "vertical";
        return;
      }
    }

    if (intentLocked.current === "horizontal") {
      // Only drag to the right (positive diffX)
      if (diffX > 0) {
        setDragOffset(diffX);
      } else {
        setDragOffset(0);
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;
    if (isClosingRef.current) return;

    if (intentLocked.current === "horizontal") {
      const duration = Date.now() - startTime.current;
      const distance = dragOffset;
      const velocity = distance / Math.max(duration, 1);

      setIsDragging(false);

      if (distance > minDistance || (velocity > velocityThreshold && distance > 25)) {
        isClosingRef.current = true;
        setIsDismissed(true);
        setTimeout(() => {
          onClose();
        }, 200);
      } else {
        setDragOffset(0);
      }
    }

    intentLocked.current = null;
  }, [dragOffset, minDistance, velocityThreshold, onClose]);

  const handleTouchCancel = useCallback(() => {
    setIsDragging(false);
    setDragOffset(0);
    intentLocked.current = null;
  }, []);

  return {
    dragOffset,
    isDragging,
    isDismissed,
    swipeHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
  };
}
