import type { PhotoRecord } from "@/types/objects";

interface PhotoSelectorProps {
  photos: PhotoRecord[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function PhotoSelector({ photos, selectedIds, onToggle }: PhotoSelectorProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/60">
        {selectedIds.length} of {photos.length} selected
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo) => {
          const selected = selectedIds.includes(photo.id);
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => {
                onToggle(photo.id);
              }}
              className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-all ${
                selected ? "border-purple-500 ring-2 ring-purple-500/30" : "border-white/10 hover:border-white/30"
              }`}
            >
              <img src={photo.originalUrl} alt="" className="h-full w-full object-cover" />
              <div
                className={`absolute inset-0 transition-colors ${
                  selected ? "bg-purple-600/20" : "bg-transparent group-hover:bg-white/5"
                }`}
              />
              <div
                className={`absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                  selected ? "border-purple-500 bg-purple-500" : "border-white/50 bg-black/30"
                }`}
              >
                {selected && (
                  <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="currentColor">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {photos.length === 0 && (
        <p className="py-8 text-center text-sm text-white/40">No photos uploaded for this object yet.</p>
      )}
    </div>
  );
}
