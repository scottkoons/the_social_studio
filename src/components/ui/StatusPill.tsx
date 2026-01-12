"use client";

type StatusType = 'input' | 'generated' | 'edited' | 'sent' | 'error';

interface StatusPillProps {
    status: StatusType;
    showDot?: boolean;
    isPastDue?: boolean;
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

// UI-only override for past-due posts (past date + not sent)
const notSentConfig = {
    label: 'Not Sent',
    dotColor: 'bg-yellow-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700'
};

export default function StatusPill({ status, showDot = true, isPastDue = false }: StatusPillProps) {
    // If past due and not sent, show "Not Sent" yellow pill
    const config = (isPastDue && status !== 'sent')
        ? notSentConfig
        : (statusConfig[status] || statusConfig.input);

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
            {showDot && <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />}
            {config.label}
        </span>
    );
}
