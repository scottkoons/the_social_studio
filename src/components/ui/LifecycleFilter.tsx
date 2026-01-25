"use client";

import { LifecycleStatus } from "@/lib/types";

export type LifecycleFilterValue = "all" | LifecycleStatus;

interface LifecycleFilterProps {
    value: LifecycleFilterValue;
    onChange: (value: LifecycleFilterValue) => void;
    counts?: Record<LifecycleStatus, number>;
}

const options: { value: LifecycleFilterValue; label: string }[] = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "exported", label: "Exported" },
    { value: "uploaded", label: "Uploaded" },
    { value: "posted", label: "Posted" },
    { value: "canceled", label: "Canceled" },
];

export default function LifecycleFilter({
    value,
    onChange,
    counts,
}: LifecycleFilterProps) {
    return (
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg">
            {options.map((option) => {
                const isSelected = value === option.value;
                const count =
                    option.value === "all"
                        ? undefined
                        : counts?.[option.value as LifecycleStatus];

                return (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={`
                            flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors
                            ${
                                isSelected
                                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }
                        `}
                    >
                        {option.label}
                        {count !== undefined && count > 0 && (
                            <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    isSelected
                                        ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                                        : "bg-[var(--bg-card)] text-[var(--text-muted)]"
                                }`}
                            >
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
