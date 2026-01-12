"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/context/AuthContext";
import { PostDay } from "@/lib/types";
import { storage, db } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { Image as ImageIcon, X, Upload } from "lucide-react";
import Image from "next/image";

interface ImageUploadProps {
    post: PostDay;
    onUploadStart: () => void;
    onUploadEnd: () => void;
}

export default function ImageUpload({ post, onUploadStart, onUploadEnd }: ImageUploadProps) {
    const { user, workspaceId } = useAuth();
    const [asset, setAsset] = useState<any>(null);

    useEffect(() => {
        const fetchAsset = async () => {
            if (post.imageAssetId && user && workspaceId) {
                const assetRef = doc(db, "workspaces", workspaceId, "assets", post.imageAssetId);
                const assetSnap = await getDoc(assetRef);
                if (assetSnap.exists()) {
                    setAsset(assetSnap.data());
                }
            } else {
                setAsset(null);
            }
        };
        fetchAsset();
    }, [post.imageAssetId, user, workspaceId]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (!user || !workspaceId || acceptedFiles.length === 0) return;

        const file = acceptedFiles[0];
        onUploadStart();

        try {
            // Storage path: assets/{workspaceId}/{YYYY-MM-DD}/{originalFilename}
            const storagePath = `assets/${workspaceId}/${post.date}/${file.name}`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, file);

            // Create asset doc under workspace
            const assetId = crypto.randomUUID();
            const assetData = {
                id: assetId,
                storagePath,
                fileName: file.name,
                contentType: file.type,
                size: file.size,
                createdAt: serverTimestamp(),
                workspaceId: workspaceId,
            };

            await setDoc(doc(db, "workspaces", workspaceId, "assets", assetId), assetData);

            // Link asset to post_day
            await updateDoc(doc(db, "workspaces", workspaceId, "post_days", post.date), {
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
    }, [user, workspaceId, post.date, onUploadStart, onUploadEnd]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false
    });

    const removeImage = async (e: React.MouseEvent) => {
        if (!user || !workspaceId) return;
        e.stopPropagation();
        onUploadStart();
        try {
            await updateDoc(doc(db, "workspaces", workspaceId, "post_days", post.date), {
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

    // Image preview with asset
    if (asset) {
        return (
            <div className="relative h-16 w-28 bg-gray-100 rounded-lg overflow-hidden group/img border border-gray-200">
                {/* Fallback icon while loading */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <ImageIcon className="text-gray-300" size={20} />
                </div>

                {/* Actual image with object-contain to preserve aspect ratio */}
                <AssetPreview storagePath={asset.storagePath} />

                {/* Hover overlay with remove button */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                        onClick={removeImage}
                        className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors"
                        title="Remove image"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* Filename badge */}
                <div className="absolute bottom-0.5 right-0.5 bg-white/90 px-1 py-0.5 rounded text-[8px] font-medium text-gray-600 max-w-[100px] truncate">
                    {asset.fileName}
                </div>
            </div>
        );
    }

    // Upload dropzone
    return (
        <div
            {...getRootProps()}
            className={`
                relative h-16 w-28 rounded-lg border-2 border-dashed transition-all cursor-pointer
                flex flex-col items-center justify-center text-center
                ${isDragActive
                    ? 'border-teal-500 bg-teal-50 text-teal-600'
                    : 'border-gray-200 text-gray-400 hover:border-teal-400 hover:bg-gray-50'
                }
            `}
        >
            <input {...getInputProps()} />
            <Upload size={16} className="mb-1" />
            <p className="text-[9px] font-medium leading-tight">
                {isDragActive ? "Drop it!" : "Drop or click"}
            </p>
        </div>
    );
}

function AssetPreview({ storagePath }: { storagePath: string }) {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        const getUrl = async () => {
            try {
                const downloadUrl = await getDownloadURL(ref(storage, storagePath));
                setUrl(downloadUrl);
            } catch (err) {
                console.error("Preview error:", err);
                setError(true);
            }
        };
        getUrl();
    }, [storagePath]);

    if (error || !url) return null;

    return (
        <Image
            src={url}
            alt="Preview"
            fill
            className="object-contain"
            sizes="112px"
        />
    );
}
