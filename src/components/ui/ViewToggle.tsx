"use client";

import { Calendar, List } from "lucide-react";

type ViewMode = "calendar" | "list";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
}

export default function ViewToggle({
  value,
  onChange,
  className = "",
}: ViewToggleProps) {
  return (
    <div
      className={`inline-flex items-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-0.5 ${className}`}
      role="tablist"
      aria-label="View mode"
    >
      <button
        role="tab"
        aria-selected={value === "calendar"}
        aria-label="Calendar view"
        onClick={() => onChange("calendar")}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all
          ${
            value === "calendar"
              ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }
        `}
      >
        <Calendar className="w-4 h-4" />
        <span className="hidden sm:inline">Calendar</span>
      </button>
      <button
        role="tab"
        aria-selected={value === "list"}
        aria-label="List view"
        onClick={() => onChange("list")}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all
          ${
            value === "list"
              ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }
        `}
      >
        <List className="w-4 h-4" />
        <span className="hidden sm:inline">List</span>
      </button>
    </div>
  );
}

export type { ViewMode };
