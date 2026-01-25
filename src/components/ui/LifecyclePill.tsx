"use client";

import { LifecycleStatus } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

interface LifecyclePillProps {
    status: LifecycleStatus;
    showDot?: boolean;
    editedAfterUpload?: boolean;
}

const statusConfig: Record<
    LifecycleStatus,
    {
        label: string;
        dotColor: string;
        borderColor: string;
        textColor: string;
    }
> = {
    draft: {
        label: "Draft",
        dotColor: "bg-gray-400",
        borderColor: "border-gray-400",
        textColor: "text-gray-600 dark:text-gray-400",
    },
    exported: {
        label: "Exported",
        dotColor: "bg-amber-500",
        borderColor: "border-amber-500",
        textColor: "text-amber-600 dark:text-amber-400",
    },
    uploaded: {
        label: "Uploaded",
        dotColor: "bg-blue-500",
        borderColor: "border-blue-500",
        textColor: "text-blue-600 dark:text-blue-400",
    },
    posted: {
        label: "Posted",
        dotColor: "bg-emerald-500",
        borderColor: "border-emerald-500",
        textColor: "text-emerald-600 dark:text-emerald-400",
    },
    canceled: {
        label: "Canceled",
        dotColor: "bg-red-500",
        borderColor: "border-red-500",
        textColor: "text-red-600 dark:text-red-400",
    },
};

export default function LifecyclePill({
    status,
    showDot = true,
    editedAfterUpload = false,
}: LifecyclePillProps) {
    const config = statusConfig[status] || statusConfig.draft;

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-[var(--bg-card)] ${config.borderColor} ${config.textColor}`}
        >
            {showDot && (
                <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
            )}
            {config.label}
            {editedAfterUpload && (
                <span title="Edited after upload">
                    <AlertTriangle size={10} className="text-amber-500" />
                </span>
            )}
        </span>
    );
}
