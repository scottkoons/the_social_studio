"use client";

import { Instagram, Facebook } from "lucide-react";

export type PlatformFilterValue = "all" | "instagram" | "facebook";

interface PlatformFilterProps {
    value: PlatformFilterValue;
    onChange: (value: PlatformFilterValue) => void;
}

const options: { value: PlatformFilterValue; label: string; icon?: typeof Instagram }[] = [
    { value: "all", label: "All Platforms" },
    { value: "instagram", label: "Instagram", icon: Instagram },
    { value: "facebook", label: "Facebook", icon: Facebook },
];

export default function PlatformFilter({ value, onChange }: PlatformFilterProps) {
    return (
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-tertiary)] rounded-lg">
            {options.map((option) => {
                const Icon = option.icon;
                const isSelected = value === option.value;

                return (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={`
                            flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                            ${isSelected
                                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }
                        `}
                    >
                        {Icon && <Icon size={16} />}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
