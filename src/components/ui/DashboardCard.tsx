"use client";

import { ReactNode } from "react";

interface DashboardCardProps {
    children: ReactNode;
    noPadding?: boolean;
    className?: string;
}

export default function DashboardCard({ children, noPadding = false, className = "" }: DashboardCardProps) {
    return (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${noPadding ? '' : 'p-6'} ${className}`}>
            {children}
        </div>
    );
}
