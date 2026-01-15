"use client";

import { ReactNode } from "react";

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    secondaryActions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions, secondaryActions }: PageHeaderProps) {
    return (
        <div className="bg-[var(--bg-secondary)] rounded-xl -mx-4 md:-mx-8 px-5 md:px-6 py-4 mb-6 mx-0 md:mx-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">{title}</h1>
                    {subtitle && (
                        <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">{subtitle}</p>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {secondaryActions && (
                        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                            {secondaryActions}
                        </div>
                    )}
                    {actions && (
                        <div className="flex items-center gap-2">
                            {actions}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
