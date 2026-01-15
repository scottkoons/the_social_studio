"use client";

import { CheckCircle2, AlertCircle, X } from "lucide-react";

interface ToastProps {
    type: 'success' | 'error' | 'warn';
    message: string;
    onClose?: () => void;
}

export default function Toast({ type, message, onClose }: ToastProps) {
    const styles = {
        success: {
            bg: 'bg-[var(--bg-card)] border-emerald-500/30',
            icon: <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={18} />,
            text: 'text-emerald-600 dark:text-emerald-400'
        },
        error: {
            bg: 'bg-[var(--bg-card)] border-red-500/30',
            icon: <AlertCircle className="text-red-500 flex-shrink-0" size={18} />,
            text: 'text-red-600 dark:text-red-400'
        },
        warn: {
            bg: 'bg-[var(--bg-card)] border-amber-500/30',
            icon: <AlertCircle className="text-amber-500 flex-shrink-0" size={18} />,
            text: 'text-amber-600 dark:text-amber-400'
        }
    };

    const style = styles[type];

    return (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${style.bg} max-w-sm animate-in slide-in-from-bottom-4 duration-200`}>
            {style.icon}
            <p className={`text-sm font-medium ${style.text}`}>{message}</p>
            {onClose && (
                <button
                    onClick={onClose}
                    className="ml-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
}
