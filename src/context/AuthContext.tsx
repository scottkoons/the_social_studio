"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    setPersistence,
    browserSessionPersistence,
    User
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { UserProfile } from "@/lib/types";

interface AuthContextType {
    user: User | null;
    workspaceId: string | null;
    loading: boolean;
    workspaceLoading: boolean;
    workspaceError: string | null;
    signIn: (email: string, pass: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [workspaceLoading, setWorkspaceLoading] = useState(false);
    const [workspaceError, setWorkspaceError] = useState<string | null>(null);

    // Track which user UID we've already bootstrapped to prevent re-runs
    const bootstrappedUidRef = useRef<string | null>(null);

    // 1. Monitor Auth State
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);

            // Reset all workspace state when user logs out
            if (!firebaseUser) {
                setWorkspaceId(null);
                setWorkspaceLoading(false);
                setWorkspaceError(null);
                bootstrappedUidRef.current = null;
            }
        });

        return () => unsubscribe();
    }, []);

    // 2. Bootstrap Workspace - runs exactly once per user login
    useEffect(() => {
        // Early return if no user
        if (!user) {
            return;
        }

        // Guard: don't re-run if we already bootstrapped this user
        if (bootstrappedUidRef.current === user.uid) {
            return;
        }

        // Mark as bootstrapping for this user immediately
        bootstrappedUidRef.current = user.uid;

        const bootstrap = async () => {
            const currentUid = user.uid;
            setWorkspaceLoading(true);
            setWorkspaceError(null);

            try {
                // Step 1: Read user profile to check for existing defaultWorkspaceId
                const userRef = doc(db, "users", currentUid);
                const userDoc = await getDoc(userRef);

                let existingWorkspaceId: string | null = null;

                if (userDoc.exists()) {
                    const profile = userDoc.data() as UserProfile;
                    existingWorkspaceId = profile.defaultWorkspaceId || null;
                }

                if (existingWorkspaceId) {
                    // User already has a workspace - use it directly
                    // Do NOT read the workspace doc (we don't have permission yet if member doc is missing)
                    setWorkspaceId(existingWorkspaceId);
                    setWorkspaceLoading(false);
                    return;
                }

                // Step 2: No workspace exists - create one
                // Order matters: workspace → member → user profile update

                const newWorkspaceId = crypto.randomUUID();
                const workspaceName = user.email
                    ? `${user.email.split('@')[0]}'s Workspace`
                    : "My Workspace";

                // 2a. Create workspace document FIRST
                await setDoc(doc(db, "workspaces", newWorkspaceId), {
                    id: newWorkspaceId,
                    name: workspaceName,
                    ownerUid: currentUid,
                    createdBy: currentUid,
                    createdAt: serverTimestamp(),
                });

                // 2b. Create member document for owner
                await setDoc(doc(db, "workspaces", newWorkspaceId, "members", currentUid), {
                    uid: currentUid,
                    role: "owner",
                    createdAt: serverTimestamp(),
                });

                // 2c. Update (or create) user profile with defaultWorkspaceId
                await setDoc(userRef, {
                    email: user.email || "",
                    displayName: user.displayName || user.email?.split('@')[0],
                    defaultWorkspaceId: newWorkspaceId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }, { merge: true });

                // Success
                setWorkspaceId(newWorkspaceId);
                setWorkspaceLoading(false);

            } catch (err) {
                console.error("Workspace bootstrap failed:", err);
                setWorkspaceError(err instanceof Error ? err.message : "Failed to set up workspace");
                setWorkspaceLoading(false);
                // Reset the bootstrapped ref so user can retry on next mount/login
                bootstrappedUidRef.current = null;
            }
        };

        bootstrap();
    }, [user]);

    const signIn = async (email: string, pass: string) => {
        try {
            await setPersistence(auth, browserSessionPersistence);
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error: unknown) {
            let message = "Unable to sign in. Please try again.";
            const firebaseError = error as { code?: string };

            if (
                firebaseError.code === "auth/invalid-credential" ||
                firebaseError.code === "auth/wrong-password" ||
                firebaseError.code === "auth/user-not-found"
            ) {
                message = "Incorrect email or password.";
            } else if (firebaseError.code === "auth/too-many-requests") {
                message = "Too many failed attempts. Please try again later.";
            }

            throw new Error(message);
        }
    };

    const logout = async () => {
        // Reset all state immediately before signing out
        setWorkspaceId(null);
        setWorkspaceLoading(false);
        setWorkspaceError(null);
        bootstrappedUidRef.current = null;

        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error logging out:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, workspaceId, loading, workspaceLoading, workspaceError, signIn, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
