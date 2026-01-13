"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { LogOut, Layout, Calendar, FileCheck, Settings } from "lucide-react";

export default function Navbar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();

    if (!user || pathname === "/login") return null;

    const navItems = [
        { name: "Input", href: "/input", icon: Layout },
        { name: "Review", href: "/review", icon: FileCheck },
        { name: "Calendar", href: "/calendar", icon: Calendar },
        { name: "Settings", href: "/settings", icon: Settings },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-100 z-50 px-4 md:px-8">
            <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/input" className="flex items-center gap-2">
                        <div className="relative w-8 h-8">
                            <Image
                                src="/branding/the-social-studio-logo.png"
                                alt="The Social Studio Logo"
                                fill
                                className="object-contain"
                                sizes="32px"
                            />
                        </div>
                        <span className="font-bold text-xl text-navy-900 hidden sm:block">The Social Studio</span>
                    </Link>

                    <div className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                        ? "bg-teal-50 text-teal-600"
                                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                                        }`}
                                >
                                    <Icon size={18} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 pr-4 border-r border-gray-100">
                        {user.photoURL && (
                            <Image
                                src={user.photoURL}
                                alt={user.displayName || "User"}
                                width={32}
                                height={32}
                                className="rounded-full"
                            />
                        )}
                        <span className="text-sm font-medium text-gray-700 hidden lg:block">
                            {user.displayName}
                        </span>
                    </div>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2 text-gray-500 hover:text-red-600 transition-colors"
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
