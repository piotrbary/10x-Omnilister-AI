import { z } from "zod";
import type { ObjectCategory } from "../lib/config";
import type { QualityScoreSnapshot } from "./transformations";

export type { QualityScoreSnapshot } from "./transformations";

export interface GptScoringResponse {
  category: "car" | "real-estate" | "item";
  features_text: string;
  scores: {
    sharpness: number;
    lighting: number;
    background: number;
    object_features: number;
    damage_defects: number;
    labels: number;
    angle_coverage: number;
    sales_readiness: number;
  };
}

export type PhotoScoreResult =
  | { photo_id: string; snapshot: QualityScoreSnapshot; score_id: string }
  | { photo_id: string; error: string };

export interface ObjectAnalysisResult {
  category: ObjectCategory;
  features_text: string;
  photoScores: PhotoScoreResult[];
  debugLogs: string[];
}

export const AnalyzeRequestSchema = z.object({
  photo_ids: z.array(z.string().uuid()).min(1),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
