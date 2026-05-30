export interface ObjectRecord {
  id: string;
  name: string;
  version: number;
  category: string | null;
  createdAt: string;
}

export interface PhotoRecord {
  id: string;
  objectId: string;
  originalUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
}
