"use client";

import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import HashtagPill from "./HashtagPill";

interface HashtagInputProps {
    hashtags: string[];
    onChange: (hashtags: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
    label?: string;
}

export default function HashtagInput({
    hashtags,
    onChange,
    placeholder = "Add hashtag",
    disabled = false,
    label,
}: HashtagInputProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newTag, setNewTag] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isAdding && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isAdding]);

    const normalizeTag = (tag: string): string => {
        return tag.trim().replace(/^#*/, "#");
    };

    const handleAdd = () => {
        const normalized = normalizeTag(newTag);
        if (normalized.length > 1) {
            // Check for duplicates (case-insensitive)
            const lowerNormalized = normalized.toLowerCase();
            const isDuplicate = hashtags.some(h => h.toLowerCase() === lowerNormalized);

            if (!isDuplicate) {
                onChange([...hashtags, normalized]);
            }
        }
        setNewTag("");
        setIsAdding(false);
    };

    const handleRemove = (index: number) => {
        onChange(hashtags.filter((_, i) => i !== index));
    };

    const handleEdit = (index: number, newValue: string) => {
        const normalized = normalizeTag(newValue);
        if (normalized.length > 1) {
            // Check for duplicates (case-insensitive), excluding current index
            const lowerNormalized = normalized.toLowerCase();
            const isDuplicate = hashtags.some((h, i) =>
                i !== index && h.toLowerCase() === lowerNormalized
            );

            if (!isDuplicate) {
                const updated = [...hashtags];
                updated[index] = normalized;
                onChange(updated);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            handleAdd();
        } else if (e.key === "Escape") {
            setNewTag("");
            setIsAdding(false);
        } else if (e.key === "Backspace" && newTag === "" && hashtags.length > 0) {
            // Remove last hashtag on backspace when input is empty
            handleRemove(hashtags.length - 1);
        }
    };

    return (
        <div>
            {label && (
                <label className="block text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">
                    {label}
                </label>
            )}
            <div className="flex flex-wrap gap-1.5 items-center min-h-[28px]">
                {hashtags.map((tag, index) => (
                    <HashtagPill
                        key={`${tag}-${index}`}
                        tag={tag}
                        onRemove={() => handleRemove(index)}
                        onEdit={(newValue) => handleEdit(index, newValue)}
                        disabled={disabled}
                    />
                ))}

                {isAdding ? (
                    <input
                        ref={inputRef}
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onBlur={handleAdd}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="px-2 py-0.5 text-xs rounded-full
                                 bg-[var(--bg-tertiary)] text-[var(--text-primary)]
                                 border border-[var(--border-primary)]
                                 focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]
                                 focus:border-[var(--accent-primary)]
                                 min-w-[80px] max-w-[120px]
                                 placeholder:text-[var(--text-muted)]"
                    />
                ) : (
                    <button
                        onClick={() => setIsAdding(true)}
                        disabled={disabled}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs
                                 border border-dashed border-[var(--border-primary)]
                                 text-[var(--text-tertiary)]
                                 hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]
                                 transition-colors
                                 disabled:opacity-50 disabled:cursor-not-allowed
                                 disabled:hover:border-[var(--border-primary)] disabled:hover:text-[var(--text-tertiary)]"
                    >
                        <Plus size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}
