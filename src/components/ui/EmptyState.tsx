"use client";

import { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mb-4">
                {icon || <Inbox className="text-[var(--text-tertiary)]" size={24} />}
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-4">{description}</p>
            )}
            {action && (
                <div className="mt-2">{action}</div>
            )}
        </div>
    );
}
