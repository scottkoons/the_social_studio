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
            bg: 'bg-white border-green-200',
            icon: <CheckCircle2 className="text-green-500 flex-shrink-0" size={18} />,
            text: 'text-green-800'
        },
        error: {
            bg: 'bg-white border-red-200',
            icon: <AlertCircle className="text-red-500 flex-shrink-0" size={18} />,
            text: 'text-red-800'
        },
        warn: {
            bg: 'bg-white border-amber-200',
            icon: <AlertCircle className="text-amber-500 flex-shrink-0" size={18} />,
            text: 'text-amber-800'
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
                    className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
}
