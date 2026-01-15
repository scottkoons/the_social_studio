"use client";

type StatusType = 'input' | 'generated' | 'edited' | 'sent' | 'error';

interface StatusPillProps {
    status: StatusType;
    showDot?: boolean;
    /**
     * UI-only flag indicating this post would be skipped if sent.
     * True if past date, missing image, or any other skip reason.
     * Shows "Not Sent" yellow pill when true and status is not 'sent' or 'error'.
     */
    wouldBeSkipped?: boolean;
}

// White/card background with colored border and text for maximum contrast
// Using CSS variables that respond to .dark class (not prefers-color-scheme)
const statusConfig: Record<StatusType, {
    label: string;
    dotColor: string;
    borderColor: string;
    textColor: string;
}> = {
    input: {
        label: 'Input',
        dotColor: 'bg-gray-400',
        borderColor: 'border-gray-400',
        textColor: 'text-gray-600'
    },
    generated: {
        label: 'Generated',
        dotColor: 'bg-emerald-500',
        borderColor: 'border-emerald-500',
        textColor: 'text-emerald-600'
    },
    edited: {
        label: 'Edited',
        dotColor: 'bg-blue-500',
        borderColor: 'border-blue-500',
        textColor: 'text-blue-600'
    },
    sent: {
        label: 'Sent',
        dotColor: 'bg-emerald-500',
        borderColor: 'border-emerald-500',
        textColor: 'text-emerald-600'
    },
    error: {
        label: 'Error',
        dotColor: 'bg-red-500',
        borderColor: 'border-red-500',
        textColor: 'text-red-600'
    }
};

// UI-only override for skipped posts (past date, missing image, etc.)
const notSentConfig = {
    label: 'Not Sent',
    dotColor: 'bg-amber-500',
    borderColor: 'border-amber-500',
    textColor: 'text-amber-600'
};

export default function StatusPill({ status, showDot = true, wouldBeSkipped = false }: StatusPillProps) {
    // Status priority:
    // 1. 'sent' always shows green Sent
    // 2. 'error' always shows red Error (API/generation failure)
    // 3. If wouldBeSkipped, show yellow Not Sent
    // 4. Otherwise, show the stored status
    let config;
    if (status === 'sent') {
        config = statusConfig.sent;
    } else if (status === 'error') {
        config = statusConfig.error;
    } else if (wouldBeSkipped) {
        config = notSentConfig;
    } else {
        config = statusConfig[status] || statusConfig.input;
    }

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-[var(--bg-card)] ${config.borderColor} ${config.textColor}`}>
            {showDot && <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />}
            {config.label}
        </span>
    );
}
