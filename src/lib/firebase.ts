import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyBxIlnHzH9pNxC5474PyH-EkX_n_fKG1lM",
    authDomain: "the-social-studio-c3dc1.firebaseapp.com",
    projectId: "the-social-studio-c3dc1",
    storageBucket: "the-social-studio-c3dc1.firebasestorage.app",
    messagingSenderId: "832553963166",
    appId: "1:832553963166:web:a9c867f834f20a96f3b58f",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { app };