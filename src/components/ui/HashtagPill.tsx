"use client";

import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";

interface HashtagPillProps {
    tag: string;
    onRemove: () => void;
    onEdit: (newTag: string) => void;
    disabled?: boolean;
}

export default function HashtagPill({ tag, onRemove, onEdit, disabled = false }: HashtagPillProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(tag);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Update editValue when tag prop changes
    useEffect(() => {
        setEditValue(tag);
    }, [tag]);

    const handleSave = () => {
        const normalized = editValue.trim().replace(/^#*/, "#");
        if (normalized.length > 1 && normalized !== tag) {
            onEdit(normalized);
        } else if (normalized.length <= 1) {
            // If empty, revert to original
            setEditValue(tag);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
        } else if (e.key === "Escape") {
            setEditValue(tag);
            setIsEditing(false);
        }
    };

    if (isEditing && !disabled) {
        return (
            <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="px-2 py-0.5 text-xs rounded-full
                         bg-[var(--bg-tertiary)] text-[var(--text-primary)]
                         border border-[var(--accent-primary)]
                         focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]
                         min-w-[60px] max-w-[120px]"
            />
        );
    }

    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                     bg-[var(--bg-tertiary)] text-[var(--text-secondary)]
                     hover:bg-[var(--bg-card-hover)] transition-colors group"
        >
            <button
                onClick={() => !disabled && setIsEditing(true)}
                disabled={disabled}
                className="hover:text-[var(--text-primary)] focus:outline-none focus:underline
                         disabled:cursor-default"
            >
                {tag}
            </button>
            {!disabled && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="text-[var(--text-tertiary)] hover:text-[var(--status-error)]
                             opacity-0 group-hover:opacity-100 transition-opacity
                             focus:opacity-100 ml-0.5"
                    aria-label={`Remove ${tag}`}
                >
                    <X size={12} />
                </button>
            )}
        </span>
    );
}
