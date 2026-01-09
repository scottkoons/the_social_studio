"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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
    const [workspaceLoading, setWorkspaceLoading] = useState(true);

    // 1. Monitor Auth State
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);
            if (!firebaseUser) {
                setWorkspaceId(null);
                setWorkspaceLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    // 2. Sync User Document and Bootstrap Workspace
    useEffect(() => {
        if (!user) return;

        const bootstrapUserAndWorkspace = async () => {
            setWorkspaceLoading(true);
            try {
                const userRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userRef);

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
                }

                // Check if user has a defaultWorkspaceId
                if (userProfile.defaultWorkspaceId) {
                    // Verify workspace exists and user has membership
                    const wsRef = doc(db, "workspaces", userProfile.defaultWorkspaceId);
                    const wsDoc = await getDoc(wsRef);

                    if (wsDoc.exists()) {
                        setWorkspaceId(userProfile.defaultWorkspaceId);
                    } else {
                        // Workspace was deleted, create a new one
                        await createWorkspaceForUser(user);
                    }
                } else {
                    // No workspace - create one
                    await createWorkspaceForUser(user);
                }
            } catch (err) {
                console.error("Workspace bootstrap error:", err);
            } finally {
                setWorkspaceLoading(false);
            }
        };

        const createWorkspaceForUser = async (user: User) => {
            const workspaceId = crypto.randomUUID();
            const workspaceName = user.email
                ? `${user.email.split('@')[0]}'s Workspace`
                : "My Workspace";

            // Create workspace document
            await setDoc(doc(db, "workspaces", workspaceId), {
                id: workspaceId,
                name: workspaceName,
                ownerUid: user.uid,
                createdAt: serverTimestamp(),
            });

            // Create member document for owner
            await setDoc(doc(db, "workspaces", workspaceId, "members", user.uid), {
                uid: user.uid,
                role: "owner",
                createdAt: serverTimestamp(),
            });

            // Update user profile with defaultWorkspaceId
            await setDoc(doc(db, "users", user.uid), {
                defaultWorkspaceId: workspaceId,
                updatedAt: serverTimestamp(),
            }, { merge: true });

            setWorkspaceId(workspaceId);
        };

        bootstrapUserAndWorkspace();
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
        try {
            await signOut(auth);
            setWorkspaceId(null);
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
