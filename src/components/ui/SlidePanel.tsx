"use client";

import { ReactNode, useEffect, useCallback, useRef, useState } from "react";
import { X } from "lucide-react";

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  width?: "sm" | "md" | "lg" | "xl";
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

const widthClasses = {
  sm: "w-[320px]",
  md: "w-[400px]",
  lg: "w-[500px]",
  xl: "w-[600px]",
};

export default function SlidePanel({
  isOpen,
  onClose,
  children,
  title,
  width = "lg",
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
}: SlidePanelProps) {
  const [isClosing, setIsClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEscape, handleClose]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className={`
          absolute inset-0 panel-overlay transition-opacity duration-200
          ${isClosing ? "opacity-0" : "opacity-100"}
        `}
        onClick={closeOnOverlayClick ? handleClose : undefined}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          relative h-full ${widthClasses[width]} max-w-[90vw]
          bg-[var(--bg-secondary)] shadow-lg
          flex flex-col
          ${isClosing ? "slide-panel-exit" : "slide-panel-enter"}
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "slide-panel-title" : undefined}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)]">
            {title && (
              <h2
                id="slide-panel-title"
                className="text-lg font-medium text-[var(--text-primary)]"
              >
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={handleClose}
                className="p-2 -m-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-md hover:bg-[var(--bg-tertiary)]"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
