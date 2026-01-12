"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import { Check, EyeOff } from "lucide-react";

export default function SettingsPage() {
    const { workspaceId, workspaceLoading } = useAuth();
    const { settings, loading, setHidePastUnsent } = useWorkspaceUiSettings();
    const [showSaved, setShowSaved] = useState(false);

    const handleToggle = async () => {
        await setHidePastUnsent(!settings.hidePastUnsent);
        setShowSaved(true);
    };

    // Hide "Saved" indicator after 2 seconds
    useEffect(() => {
        if (showSaved) {
            const timer = setTimeout(() => setShowSaved(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [showSaved]);

    // Show loading while workspace is being resolved
    if (workspaceLoading || !workspaceId) {
        return (
            <div className="p-4 md:p-8 max-w-7xl mx-auto">
                <DashboardCard>
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-teal-500 mx-auto mb-4"></div>
                        <p className="text-sm text-gray-500">Loading settings...</p>
                    </div>
                </DashboardCard>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <PageHeader
                title="Settings"
                subtitle="Manage your workspace preferences."
            />

            <DashboardCard>
                <div className="space-y-6">
                    {/* Section Header */}
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Display Settings</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Control how content is displayed across your workspace.
                        </p>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        {/* Hide Past Unsent Toggle */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 p-2 bg-gray-100 rounded-lg">
                                    <EyeOff size={18} className="text-gray-600" />
                                </div>
                                <div>
                                    <label
                                        htmlFor="hidePastUnsent"
                                        className="text-sm font-medium text-gray-900 cursor-pointer"
                                    >
                                        Hide past unsent posts
                                    </label>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        Hides posts dated before today that were not sent to Buffer.
                                        Sent posts always remain visible.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {/* Saved indicator */}
                                {showSaved && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                                        <Check size={14} />
                                        Saved
                                    </span>
                                )}

                                {/* Toggle switch */}
                                <button
                                    id="hidePastUnsent"
                                    role="switch"
                                    aria-checked={settings.hidePastUnsent}
                                    onClick={handleToggle}
                                    disabled={loading}
                                    className={`
                                        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                                        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2
                                        disabled:opacity-50 disabled:cursor-not-allowed
                                        ${settings.hidePastUnsent ? 'bg-teal-600' : 'bg-gray-200'}
                                    `}
                                >
                                    <span
                                        className={`
                                            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                                            transition duration-200 ease-in-out
                                            ${settings.hidePastUnsent ? 'translate-x-5' : 'translate-x-0'}
                                        `}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </DashboardCard>
        </div>
    );
}
