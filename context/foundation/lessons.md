# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Feature flags must have a kill date before merging

- **Context**: Any phase that introduces or extends a feature flag
- **Problem**: Flags accumulate without removal — dead code and tech debt build up. No kill date means no one owns cleanup; flags become permanent toggles.
- **Rule**: Feature flags must always have a kill date set before merging.
- **Applies to**: plan, implement, impl-review
