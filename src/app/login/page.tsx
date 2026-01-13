"use client";

import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { LogIn, Mail, Lock, Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const { signIn } = useAuth();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await signIn(email, password);
            router.replace("/input");
        } catch (err: any) {
            // No need to console.error standard auth failures, 
            // the friendly message is enough for the user.
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-navy-50 p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl shadow-teal-900/5 p-8 flex flex-col items-center">
                <div className="relative w-20 h-20 mb-6">
                    <Image
                        src="/branding/the-social-studio-logo.png"
                        alt="The Social Studio Logo"
                        fill
                        className="object-contain"
                        sizes="80px"
                    />
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-2">The Social Studio</h1>
                <p className="text-gray-500 mb-8 text-center">
                    Your command center for effortless social media planning.
                </p>

                <form onSubmit={handleSubmit} className="w-full space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-3">
                            <AlertCircle size={18} />
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-sm outline-none"
                                placeholder="name@example.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-sm outline-none"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white py-3.5 px-4 rounded-xl font-bold text-sm hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 mt-2"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                <LogIn size={20} />
                                Sign In
                            </>
                        )}
                    </button>
                </form>

                <p className="mt-8 text-[10px] text-gray-400 text-center uppercase tracking-widest">
                    Restricted Access • Authorized Personnel Only
                </p>
            </div>
        </div>
    );
}
