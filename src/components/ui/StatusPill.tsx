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

const statusConfig: Record<StatusType, { label: string; dotColor: string; bgColor: string; textColor: string }> = {
    input: {
        label: 'Input',
        dotColor: 'bg-gray-400',
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-600'
    },
    generated: {
        label: 'Generated',
        dotColor: 'bg-teal-500',
        bgColor: 'bg-teal-50',
        textColor: 'text-teal-700'
    },
    edited: {
        label: 'Edited',
        dotColor: 'bg-blue-500',
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700'
    },
    sent: {
        label: 'Sent',
        dotColor: 'bg-green-500',
        bgColor: 'bg-green-50',
        textColor: 'text-green-700'
    },
    error: {
        label: 'Error',
        dotColor: 'bg-red-500',
        bgColor: 'bg-red-50',
        textColor: 'text-red-700'
    }
};

// UI-only override for skipped posts (past date, missing image, etc.)
const notSentConfig = {
    label: 'Not Sent',
    dotColor: 'bg-yellow-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700'
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
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
            {showDot && <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />}
            {config.label}
        </span>
    );
}
