import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/context/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import ClientOnly from "@/components/ClientOnly";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Social Studio",
  description: "Schedule your social media content with ease.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-gray-50 text-gray-900`}>
        <AuthProvider>
          <ClientOnly>
            <AuthGuard>
              <Navbar />
              <main className="pt-16 min-h-screen">{children}</main>
            </AuthGuard>
          </ClientOnly>
        </AuthProvider>
      </body>
    </html>
  );
}