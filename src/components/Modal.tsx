import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  readonly children: ReactNode;
  readonly eyebrow?: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly variant?: 'dialog' | 'drawer';
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const Modal = ({
  children,
  eyebrow,
  isOpen,
  onClose,
  title,
  variant = 'dialog',
}: ModalProps) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const portalRoot = dialogRef.current?.parentElement;
    const pageElements = [...document.body.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== portalRoot,
    );
    const previousInertValues = pageElements.map((element) => element.inert);
    document.body.style.overflow = 'hidden';
    pageElements.forEach((element) => {
      element.inert = true;
    });

    const dialog = dialogRef.current;
    const focusableElements = () =>
      dialog === null
        ? []
        : [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];

    focusableElements().at(0)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const first = elements.at(0);
      const last = elements.at(-1);
      if (first === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      pageElements.forEach((element, index) => {
        element.inert = previousInertValues[index] ?? false;
      });
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`modal-backdrop modal-backdrop--${variant}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal-shell modal-shell--${variant}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div>
            {eyebrow === undefined ? null : (
              <span className="panel-kicker">{eyebrow}</span>
            )}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            aria-label={`Close ${title}`}
            className="modal-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">X</span>
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
};
