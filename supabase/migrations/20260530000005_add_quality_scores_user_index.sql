-- Support user-level quality score queries (e.g., dashboard, export)
-- without a full sequential scan when photo_id is not in the filter.
CREATE INDEX idx_quality_scores_user ON quality_scores(user_id);
