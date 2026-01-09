"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            if (!user && pathname !== "/login") {
                router.replace("/login");
            } else if (user && pathname === "/login") {
                router.replace("/input");
            }
        }
    }, [user, loading, pathname, router]);

    // If we're on the login page, we can show it immediately if not loading or if we already know user is null
    if (loading && pathname !== "/login") {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500"></div>
            </div>
        );
    }

    return <>{children}</>;
}
