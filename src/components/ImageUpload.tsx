"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/context/AuthContext";
import { PostDay } from "@/lib/types";
import { storage, db } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { Image as ImageIcon, X, Upload, Check } from "lucide-react";
import Image from "next/image";

interface ImageUploadProps {
    post: PostDay;
    onUploadStart: () => void;
    onUploadEnd: () => void;
}

export default function ImageUpload({ post, onUploadStart, onUploadEnd }: ImageUploadProps) {
    const { user } = useAuth();
    const [asset, setAsset] = useState<any>(null);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        const fetchAsset = async () => {
            if (post.imageAssetId && user) {
                const assetRef = doc(db, "users", user.uid, "assets", post.imageAssetId);
                const assetSnap = await getDoc(assetRef);
                if (assetSnap.exists()) {
                    setAsset(assetSnap.data());
                }
            } else {
                setAsset(null);
            }
        };
        fetchAsset();
    }, [post.imageAssetId, user]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (!user || acceptedFiles.length === 0) return;

        const file = acceptedFiles[0];
        onUploadStart();

        try {
            // Deterministic storage path: assets/{uid}/{YYYY-MM-DD}/{originalFilename}
            const storagePath = `assets/${user.uid}/${post.date}/${file.name}`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, file);

            // Create asset doc
            const assetId = crypto.randomUUID();
            const assetData = {
                id: assetId,
                storagePath,
                fileName: file.name,
                contentType: file.type,
                size: file.size,
                createdAt: serverTimestamp(),
                userId: user.uid,
            };

            await setDoc(doc(db, "users", user.uid, "assets", assetId), assetData);

            // Link asset to post_day
            await updateDoc(doc(db, "users", user.uid, "post_days", post.date), {
                imageAssetId: assetId,
                updatedAt: serverTimestamp(),
            });

            setAsset(assetData);
        } catch (error) {
            console.error("Upload error:", error);
            alert("Failed to upload image.");
        } finally {
            onUploadEnd();
        }
    }, [user, post.date, onUploadStart, onUploadEnd]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false
    });

    const removeImage = async (e: React.MouseEvent) => {
        if (!user) return;
        e.stopPropagation();
        onUploadStart();
        try {
            await updateDoc(doc(db, "users", user.uid, "post_days", post.date), {
                imageAssetId: null,
                updatedAt: serverTimestamp(),
            });
            setAsset(null);
        } catch (error) {
            console.error("Remove error:", error);
        } finally {
            onUploadEnd();
        }
    };

    if (asset) {
        return (
            <div className="relative w-full aspect-video bg-gray-50 rounded-lg overflow-hidden group/img cursor-default border border-gray-100">
                <div className="absolute inset-0 flex items-center justify-center">
                    <ImageIcon className="text-gray-200" size={32} />
                </div>
                {/* We can't easily show a preview without getting a download URL, 
            which might be slow to do for every row. 
            For Phase 1, showing the filename or a simple check is fine. 
            But let's try to get the URL for a nicer UI. */}
                <AssetPreview storagePath={asset.storagePath} />

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                        onClick={removeImage}
                        className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors"
                        title="Remove"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="absolute bottom-1 right-1 bg-white/90 px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-600 backdrop-blur-sm">
                    {asset.fileName}
                </div>
            </div>
        );
    }

    return (
        <div
            {...getRootProps()}
            className={`relative w-full aspect-video rounded-lg border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center p-4 text-center
        ${isDragActive ? 'border-teal-500 bg-teal-50 text-teal-600' : 'border-gray-200 text-gray-400 hover:border-teal-400 hover:bg-gray-50'}`}
        >
            <input {...getInputProps()} />
            <Upload size={20} className="mb-2" />
            <p className="text-[10px] font-medium leading-tight">
                {isDragActive ? "Drop it!" : "Drag image or click"}
            </p>
        </div>
    );
}

function AssetPreview({ storagePath }: { storagePath: string }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        const getUrl = async () => {
            try {
                const downloadUrl = await getDownloadURL(ref(storage, storagePath));
                setUrl(downloadUrl);
            } catch (err) {
                console.error("Preview error:", err);
            }
        };
        getUrl();
    }, [storagePath]);

    if (!url) return null;

    return (
        <Image
            src={url}
            alt="Preview"
            fill
            className="object-cover"
            sizes="200px"
        />
    );
}
