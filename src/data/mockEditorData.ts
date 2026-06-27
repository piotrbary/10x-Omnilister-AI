import type { ObjectRecord, PhotoRecord } from "@/types/objects";
import type { QualityScoreSnapshot } from "@/types/transformations";

export const MOCK_OBJECT: ObjectRecord = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "BMW 320d",
  version: 1,
  category: "car",
  createdAt: "2026-01-01T00:00:00Z",
};

export const MOCK_PHOTOS: PhotoRecord[] = [
  {
    id: "00000000-0000-0000-0000-000000000010",
    objectId: MOCK_OBJECT.id,
    originalUrl: "https://placehold.co/800x600/f3f4f6/9ca3af?text=Oryginal",
    fileSizeBytes: 512000,
    mimeType: "image/jpeg",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000011",
    objectId: MOCK_OBJECT.id,
    originalUrl: "https://placehold.co/800x600/f3f4f6/9ca3af?text=Oryginal+2",
    fileSizeBytes: 480000,
    mimeType: "image/jpeg",
    createdAt: "2026-01-01T00:01:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000012",
    objectId: MOCK_OBJECT.id,
    originalUrl: "https://placehold.co/800x600/f3f4f6/9ca3af?text=Oryginal+3",
    fileSizeBytes: 524000,
    mimeType: "image/jpeg",
    createdAt: "2026-01-01T00:02:00Z",
  },
];

export const MOCK_SCORE_AFTER: QualityScoreSnapshot = {
  overall: 7.9,
  is_sales_ready: true,
  sharpness: 8.5,
  lighting: 8.0,
  background: 9.0,
  object_features: 7.5,
  damage_defects: 7.0,
  labels: 8.0,
  angle_coverage: 7.5,
  sales_readiness: 8.0,
};

export const MOCK_STORAGE: { usedMb: number; totalMb: number } = {
  usedMb: 42,
  totalMb: 100,
};
