import { useState } from "react";
import { Trash2 } from "lucide-react";
import { storageConfig } from "@/lib/config";
import { ServerError } from "@/components/auth/ServerError";
import PhotoUploader from "@/components/objects/PhotoUploader";
import type { PhotoRecord } from "@/types/objects";

interface PhotoGalleryProps {
  objectId: string;
  initialPhotos: PhotoRecord[];
}

export default function PhotoGallery({ objectId, initialPhotos }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<PhotoRecord[]>(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleUploadComplete(photo: PhotoRecord) {
    setPhotos((prev) => [...prev, photo]);
    setError(null);
  }

  async function deletePhoto(photoId: string) {
    setDeletingId(photoId);
    setError(null);

    try {
      const res = await fetch(`/api/objects/${objectId}/photos/${photoId}`, { method: "DELETE" });

      if (res.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to delete photo");
        return;
      }

      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch {
      setError("Network error — please try again");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-sm text-white/60">
        <span>
          {photos.length} / {storageConfig.maxPhotosPerObject} photos
        </span>
      </div>

      <PhotoUploader
        objectId={objectId}
        currentCount={photos.length}
        onUploadComplete={handleUploadComplete}
        onError={(msg) => {
          setError(msg);
        }}
      />

      <ServerError message={error} />

      {photos.length === 0 ? (
        <p className="py-8 text-center text-white/40">No photos yet — upload the first one.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl">
              <img src={photo.originalUrl} alt="" className="size-full object-cover" loading="lazy" />
              <button
                onClick={() => {
                  void deletePhoto(photo.id);
                }}
                disabled={deletingId === photo.id}
                className="absolute top-2 right-2 rounded-lg bg-black/60 p-1.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600/80 disabled:cursor-not-allowed"
                aria-label="Delete photo"
              >
                {deletingId === photo.id ? (
                  <span className="block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Trash2 className="size-4 text-white" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
