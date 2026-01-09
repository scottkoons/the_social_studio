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
    signIn: (email: string, pass: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [workspaceLoading, setWorkspaceLoading] = useState(false);

    // Track if component is mounted to prevent state updates after unmount
    const isMountedRef = useRef(true);

    // 1. Monitor Auth State
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (!isMountedRef.current) return;

            setUser(firebaseUser);
            setLoading(false);

            // Reset workspace state when user logs out
            if (!firebaseUser) {
                setWorkspaceId(null);
                setWorkspaceLoading(false);
            }
        });

        return () => {
            isMountedRef.current = false;
            unsubscribe();
        };
    }, []);

    // 2. Sync User Document and Bootstrap Workspace
    useEffect(() => {
        // Early return if no user - don't do any Firestore operations
        if (!user) {
            return;
        }

        let cancelled = false;

        const bootstrapUserAndWorkspace = async () => {
            // Double-check user still exists before starting
            if (!user) return;

            setWorkspaceLoading(true);

            try {
                const userRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userRef);

                // Check if cancelled before proceeding
                if (cancelled) return;

                let userProfile: Partial<UserProfile> = userDoc.exists()
                    ? userDoc.data() as UserProfile
                    : {};

                // Create user doc if it doesn't exist
                if (!userDoc.exists()) {
                    userProfile = {
                        email: user.email || "",
                        displayName: user.displayName || user.email?.split('@')[0],
                        createdAt: serverTimestamp() as any,
                        updatedAt: serverTimestamp() as any,
                    };
                    await setDoc(userRef, userProfile, { merge: true });

                    if (cancelled) return;
                }

                // Check if user has a defaultWorkspaceId
                if (userProfile.defaultWorkspaceId) {
                    // Verify workspace exists
                    const wsRef = doc(db, "workspaces", userProfile.defaultWorkspaceId);
                    const wsDoc = await getDoc(wsRef);

                    if (cancelled) return;

                    if (wsDoc.exists()) {
                        setWorkspaceId(userProfile.defaultWorkspaceId);
                    } else {
                        // Workspace was deleted, create a new one
                        await createWorkspaceForUser(user, cancelled);
                    }
                } else {
                    // No workspace - create one
                    await createWorkspaceForUser(user, cancelled);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error("Workspace bootstrap error:", err);
                }
            } finally {
                if (!cancelled) {
                    setWorkspaceLoading(false);
                }
            }
        };

        const createWorkspaceForUser = async (currentUser: User, isCancelled: boolean) => {
            if (isCancelled) return;

            const newWorkspaceId = crypto.randomUUID();
            const workspaceName = currentUser.email
                ? `${currentUser.email.split('@')[0]}'s Workspace`
                : "My Workspace";

            // Create workspace document
            await setDoc(doc(db, "workspaces", newWorkspaceId), {
                id: newWorkspaceId,
                name: workspaceName,
                ownerUid: currentUser.uid,
                createdAt: serverTimestamp(),
            });

            if (isCancelled) return;

            // Create member document for owner
            await setDoc(doc(db, "workspaces", newWorkspaceId, "members", currentUser.uid), {
                uid: currentUser.uid,
                role: "owner",
                createdAt: serverTimestamp(),
            });

            if (isCancelled) return;

            // Update user profile with defaultWorkspaceId
            await setDoc(doc(db, "users", currentUser.uid), {
                defaultWorkspaceId: newWorkspaceId,
                updatedAt: serverTimestamp(),
            }, { merge: true });

            if (isCancelled) return;

            setWorkspaceId(newWorkspaceId);
        };

        bootstrapUserAndWorkspace();

        // Cleanup: mark as cancelled if user changes or component unmounts
        return () => {
            cancelled = true;
        };
    }, [user]);

    const signIn = async (email: string, pass: string) => {
        try {
            await setPersistence(auth, browserSessionPersistence);
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error: any) {
            let message = "Unable to sign in. Please try again.";

            if (
                error.code === "auth/invalid-credential" ||
                error.code === "auth/wrong-password" ||
                error.code === "auth/user-not-found"
            ) {
                message = "Incorrect email or password.";
            } else if (error.code === "auth/too-many-requests") {
                message = "Too many failed attempts. Please try again later.";
            }

            throw new Error(message);
        }
    };

    const logout = async () => {
        // Reset workspace state immediately before signing out
        setWorkspaceId(null);
        setWorkspaceLoading(false);

        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error logging out:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, workspaceId, loading, workspaceLoading, signIn, logout }}>
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
