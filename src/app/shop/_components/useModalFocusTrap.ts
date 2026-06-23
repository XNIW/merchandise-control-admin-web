"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
const modalFocusTrapStack: symbol[] = [];

function removeModalFocusTrap(trapId: symbol) {
  const index = modalFocusTrapStack.indexOf(trapId);

  if (index >= 0) {
    modalFocusTrapStack.splice(index, 1);
  }
}

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      (element.offsetParent !== null || element === document.activeElement),
  );
}

export function useModalFocusTrap<T extends HTMLElement>(
  open: boolean,
  onClose?: () => void,
) {
  const dialogRef = useRef<T | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trapId = Symbol("modal-focus-trap");
    modalFocusTrapStack.push(trapId);

    const dialogElement = dialogRef.current;

    if (!dialogElement) {
      removeModalFocusTrap(trapId);
      return;
    }

    const dialog: HTMLElement = dialogElement;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFirst = () => {
      const focusable = focusableElements(dialog);
      (focusable[0] ?? dialog).focus({ preventScroll: true });
    };
    const animationFrame = window.requestAnimationFrame(focusFirst);

    function handleKeyDown(event: KeyboardEvent) {
      if (modalFocusTrapStack[modalFocusTrapStack.length - 1] !== trapId) {
        return;
      }

      if (event.key === "Escape" && onClose) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = focusableElements(dialog);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
        return;
      }

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
      removeModalFocusTrap(trapId);

      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, onClose]);

  return dialogRef;
}
