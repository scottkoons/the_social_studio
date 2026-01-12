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
        <div className="bg-white border-b border-gray-200 -mx-4 md:-mx-8 px-4 md:px-8 py-4 mb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold text-gray-900 truncate">{title}</h1>
                    {subtitle && (
                        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {secondaryActions && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            {secondaryActions}
                        </div>
                    )}
                    {actions && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {actions}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
