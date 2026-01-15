"use client";

import { ReactNode } from "react";

interface DashboardCardProps {
    children: ReactNode;
    noPadding?: boolean;
    className?: string;
}

export default function DashboardCard({ children, noPadding = false, className = "" }: DashboardCardProps) {
    return (
        <div
            className={`
                bg-[var(--bg-card)] rounded-xl border border-[var(--border-primary)]
                shadow-[var(--shadow-sm)] overflow-hidden
                ${noPadding ? '' : 'p-6'}
                ${className}
            `}
        >
            {children}
        </div>
    );
}
