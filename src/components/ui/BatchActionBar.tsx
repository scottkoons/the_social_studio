"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

interface BatchAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

interface BatchActionBarProps {
  selectedCount: number;
  onClear: () => void;
  actions: BatchAction[];
  className?: string;
}

export default function BatchActionBar({
  selectedCount,
  onClear,
  actions,
  className = "",
}: BatchActionBarProps) {
  // Handle ESC to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedCount > 0) {
        onClear();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedCount, onClear]);

  if (selectedCount === 0) return null;

  return (
    <div
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-40
        flex items-center gap-4 px-4 py-3 rounded-lg shadow-lg
        bg-[var(--batch-bar-bg)] text-[var(--batch-bar-text)]
        animate-in slide-in-from-bottom-4 duration-200
        ${className}
      `}
      role="toolbar"
      aria-label="Batch actions"
    >
      {/* Selection count */}
      <div className="flex items-center gap-2 pr-4 border-r border-white/20">
        <span className="text-sm font-medium">
          {selectedCount} selected
        </span>
        <button
          onClick={onClear}
          className="p-1 -m-1 hover:bg-white/10 rounded transition-colors"
          aria-label="Clear selection (Esc)"
          title="Clear selection (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            disabled={action.disabled}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
              ${action.disabled ? "opacity-50 cursor-not-allowed" : ""}
              ${
                action.variant === "danger"
                  ? "hover:bg-red-500/20 text-red-300"
                  : "hover:bg-white/10"
              }
            `}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
