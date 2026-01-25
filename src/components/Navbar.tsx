"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { LogOut, Settings, LayoutDashboard, FileText, Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function Navbar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    if (!user || pathname === "/login") return null;

    // V2 Navigation: 3 items only
    const navItems = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Posts", href: "/posts", icon: FileText },
        { name: "Settings", href: "/settings", icon: Settings },
    ];

    const handleNavClick = () => {
        setMobileMenuOpen(false);
    };

    return (
        <>
            <nav className="fixed top-0 left-0 right-0 h-14 md:h-16 bg-[var(--bg-card)] border-b border-[var(--border-primary)] z-50 px-4 md:px-8">
                <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
                    {/* Left side: Hamburger + Logo */}
                    <div className="flex items-center gap-3 md:gap-8">
                        {/* Mobile hamburger button */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden p-2 -ml-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>

                        <Link href="/dashboard" className="flex items-center" onClick={handleNavClick}>
                            <div className="relative h-7 md:h-8 w-auto">
                                <Image
                                    src="/branding/the-social-studio-logo.png"
                                    alt="The Social Studio"
                                    width={180}
                                    height={32}
                                    className="object-contain h-7 md:h-8 w-auto block dark:hidden"
                                    priority
                                />
                                <Image
                                    src="/branding/the-social-studio-logo-wt.png"
                                    alt="The Social Studio"
                                    width={180}
                                    height={32}
                                    className="object-contain h-7 md:h-8 w-auto hidden dark:block"
                                    priority
                                />
                            </div>
                        </Link>

                        {/* Desktop navigation */}
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

                    {/* Right side: Theme toggle, user, logout */}
                    <div className="flex items-center gap-2 md:gap-3">
                        <ThemeToggle />

                        <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-[var(--border-primary)]">
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
                            className="flex items-center gap-2 p-2 text-[var(--text-secondary)] hover:text-[var(--status-error)] transition-colors rounded-lg hover:bg-[var(--bg-tertiary)]"
                            title="Logout"
                        >
                            <LogOut size={20} />
                            <span className="text-sm font-medium hidden sm:block">Logout</span>
                        </button>
                    </div>
                </div>
            </nav>

            {/* Mobile menu overlay */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Mobile menu drawer */}
            <div
                className={`fixed top-14 left-0 right-0 bg-[var(--bg-card)] border-b border-[var(--border-primary)] z-40 md:hidden transform transition-transform duration-200 ease-out ${
                    mobileMenuOpen ? "translate-y-0" : "-translate-y-full"
                }`}
            >
                <div className="p-4 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={handleNavClick}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                                    isActive
                                        ? "bg-[var(--accent-bg)] text-[var(--accent-primary)]"
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                                }`}
                            >
                                <Icon size={20} />
                                {item.name}
                            </Link>
                        );
                    })}

                    {/* User info on mobile */}
                    {user.photoURL && (
                        <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-[var(--border-primary)]">
                            <Image
                                src={user.photoURL}
                                alt={user.displayName || "User"}
                                width={36}
                                height={36}
                                className="rounded-full"
                            />
                            <span className="text-sm font-medium text-[var(--text-secondary)]">
                                {user.displayName}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
