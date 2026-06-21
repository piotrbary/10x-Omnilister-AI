import { z } from "zod";

export type TransformationStatus = "pending" | "full_ready" | "failed" | "saved";

export type FeedbackValue = "improved" | "not_improved";

export interface QualityScoreSnapshot {
  sharpness: number;
  lighting: number;
  background: number;
  object_features: number;
  damage_defects: number;
  labels: number;
  angle_coverage: number;
  sales_readiness: number;
  overall: number;
  is_sales_ready: boolean;
}

export interface TransformationJob {
  id: string;
  user_id: string;
  object_id: string;
  photo_id: string;
  style_name: string;
  prompt: string;
  status: TransformationStatus;
  result_url: string | null;
  result_file_size_bytes: number | null;
  score_before: QualityScoreSnapshot | null;
  score_after: QualityScoreSnapshot | null;
  feedback: FeedbackValue | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export const StartTransformationRequestSchema = z.object({
  object_id: z.string().uuid(),
  photo_ids: z.array(z.string().uuid()).min(1).max(10),
  style_name: z.string().min(1),
  custom_prompt: z.string().optional(),
});

export type StartTransformationRequest = z.infer<typeof StartTransformationRequestSchema>;

export const FeedbackRequestSchema = z.object({
  feedback: z.enum(["improved", "not_improved"]),
});

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const StatusResponseJobSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "full_ready", "failed", "saved"]),
  result_url: z.string().nullable(),
  score_before: z.record(z.string(), z.unknown()).nullable(),
  score_after: z.record(z.string(), z.unknown()).nullable(),
  error_message: z.string().nullable(),
  retry_count: z.number().int(),
});

export type StatusResponseJob = z.infer<typeof StatusResponseJobSchema>;
