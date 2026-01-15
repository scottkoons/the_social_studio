"use client";

import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

type Theme = "light" | "dark" | "system";

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
];

export default function ThemeToggle() {
    const { theme, resolvedTheme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Close dropdown on escape key
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, []);

    const CurrentIcon = resolvedTheme === "dark" ? Moon : Sun;

    return (
        <div ref={dropdownRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-center w-9 h-9 rounded-lg
                         text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                         hover:bg-[var(--bg-tertiary)] transition-colors"
                aria-label="Toggle theme"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <CurrentIcon size={18} />
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 mt-2 w-36 py-1 rounded-lg shadow-lg z-50
                             bg-[var(--bg-card)] border border-[var(--border-primary)]"
                    role="listbox"
                    aria-label="Theme options"
                >
                    {themeOptions.map((option) => {
                        const Icon = option.icon;
                        const isSelected = theme === option.value;

                        return (
                            <button
                                key={option.value}
                                onClick={() => {
                                    setTheme(option.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm
                                          transition-colors
                                          ${isSelected
                                              ? "text-[var(--accent-primary)] bg-[var(--accent-bg-light)]"
                                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                                          }`}
                                role="option"
                                aria-selected={isSelected}
                            >
                                <Icon size={16} />
                                <span>{option.label}</span>
                                {isSelected && (
                                    <span className="ml-auto text-[var(--accent-primary)]">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                                        </svg>
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
