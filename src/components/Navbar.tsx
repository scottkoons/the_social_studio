"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { LogOut, Layout, Calendar, FileCheck, Settings, CalendarPlus } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function Navbar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();

    if (!user || pathname === "/login") return null;

    const navItems = [
        { name: "Planning", href: "/planning", icon: CalendarPlus },
        { name: "Input", href: "/input", icon: Layout },
        { name: "Review", href: "/review", icon: FileCheck },
        { name: "Calendar", href: "/calendar", icon: Calendar },
        { name: "Settings", href: "/settings", icon: Settings },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 h-16 bg-[var(--bg-card)] border-b border-[var(--border-primary)] z-50 px-4 md:px-8">
            <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/planning" className="flex items-center">
                        <div className="relative h-8 w-auto">
                            <Image
                                src="/branding/the-social-studio-logo.png"
                                alt="The Social Studio"
                                width={180}
                                height={32}
                                className="object-contain h-8 w-auto block dark:hidden"
                                priority
                            />
                            <Image
                                src="/branding/the-social-studio-logo-wt.png"
                                alt="The Social Studio"
                                width={180}
                                height={32}
                                className="object-contain h-8 w-auto hidden dark:block"
                                priority
                            />
                        </div>
                    </Link>

                    <div className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        isActive
                                            ? "bg-[var(--accent-bg)] text-[var(--accent-primary)]"
                                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                                    }`}
                                >
                                    <Icon size={18} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <ThemeToggle />

                    <div className="flex items-center gap-3 pl-3 border-l border-[var(--border-primary)]">
                        {user.photoURL && (
                            <Image
                                src={user.photoURL}
                                alt={user.displayName || "User"}
                                width={32}
                                height={32}
                                className="rounded-full"
                            />
                        )}
                        <span className="text-sm font-medium text-[var(--text-secondary)] hidden lg:block">
                            {user.displayName}
                        </span>
                    </div>

                    <button
                        onClick={logout}
                        className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--status-error)] transition-colors"
                        title="Logout"
                    >
                        <LogOut size={20} />
                        <span className="text-sm font-medium hidden sm:block">Logout</span>
                    </button>
                </div>
            </div>
        </nav>
    );
}
