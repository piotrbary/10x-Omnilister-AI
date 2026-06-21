# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Feature flags must have a kill date before merging

- **Context**: Any phase that introduces or extends a feature flag
- **Problem**: Flags accumulate without removal — dead code and tech debt build up. No kill date means no one owns cleanup; flags become permanent toggles.
- **Rule**: Feature flags must always have a kill date set before merging.
- **Applies to**: plan, implement, impl-review

## Validate client-provided storage paths before use

- **Context**: Any API route that accepts a storage path from the client body (e.g. a two-step upload confirm endpoint) and uses it to call getPublicUrl or insert into the DB.
- **Problem**: A caller can forge a path pointing to another user's storage object. The server validates object ownership but not the path string — enabling cross-user URL hijacking where a malicious user registers someone else's file URL in their own gallery.
- **Rule**: Before using a client-supplied storage path in getPublicUrl or any DB insert, assert that it starts with the authenticated user's ID and the validated objectId: `if (!path.startsWith(`${user.id}/${objectId}/`)) return 422`.
- **Applies to**: plan, implement, impl-review

## Reconstruct storage paths from trusted values, not public URLs

- **Context**: Any route that needs to call storage.remove() or reference a file's storage path, when the original path was written to the DB as a public URL.
- **Problem**: Slicing N segments from the end of a public URL (e.g. `segments.slice(-3)`) is brittle — CDN rewrites, URL format changes, or extra path components break the count and produce a wrong path, orphaning files while the DB row is already deleted.
- **Rule**: Extract only the filename with `.split('/').at(-1)`, then reconstruct the full path from known-trusted values: `` `${user.id}/${objectId}/${fileName}` ``. Never rely on a fixed segment count from a public URL.
- **Applies to**: plan, implement, impl-review

## Stage only the change's own files at commit time

- **Context**: Any phase-end commit ritual when multiple changes are in progress simultaneously.
- **Problem**: Working on two changes in the same session causes one change's untracked/modified files to appear in `git status` and get accidentally staged alongside another change's commit, polluting the diff and making `git bisect` harder.
- **Rule**: At the phase-end commit step, stage files by explicit path only (never `git add -A` or `git add .`) and cross-check against the touched-file set for the current change. If `git status` shows files from a different change-id, leave them unstaged.
- **Applies to**: implement, impl-review

## Mirror all WHERE filters from SELECT to the subsequent DELETE/UPDATE

- **Context**: Any route that does a SELECT to verify ownership/existence before a DELETE or UPDATE on the same row.
- **Problem**: The SELECT may include multiple equality filters (id, object_id, user_id) for safety, but the DELETE only uses a subset. If the pre-flight check is ever bypassed, removed, or reordered, the DELETE runs without the full set of constraints.
- **Rule**: The DELETE/UPDATE statement must include at minimum the same ownership filters (`user_id`, `object_id` where applicable) as the preceding SELECT, even when the SELECT already guarantees the row exists.
- **Applies to**: plan, implement, impl-review

## Always pre-check object ownership before querying child resources

- **Context**: Any nested REST endpoint (e.g. `/objects/:objectId/photos`) that reads or writes child rows.
- **Problem**: Filtering child rows by `(object_id + user_id)` is not the same as verifying the parent object exists and belongs to the user. A caller gets empty results instead of 404, leaking whether the objectId is valid, and the ownership contract is inconsistently enforced across routes.
- **Rule**: Before querying any child table (photos, etc.) for a given parent ID, do an explicit ownership check on the parent table first (`SELECT id WHERE id = objectId AND user_id = userId`). Return 404 if not found.
- **Applies to**: plan, implement, impl-review

## Soft-guard races compound under concurrent client uploads

- **Context**: Any file upload flow where the client can select multiple files and the server uses a soft (non-DB-enforced) count or quota check.
- **Problem**: Firing N uploads concurrently means N threads all pass the same soft guard before any of them commit. This can allow temporary breaches of per-object limits. The plan may explicitly accept this race for MVP, but it should be a conscious decision documented each time.
- **Rule**: When accepting a soft-guard race for MVP, explicitly note it in the plan. Before public launch, cap client concurrency (process uploads sequentially or limit to 2–3 parallel) to narrow the race window to an acceptable level.
- **Applies to**: plan, impl-review

## Apply user_id filter on every query, even when ownership is implied

- **Context**: Any database query on a user-owned table (photos, objects, profiles) inside an authenticated route.
- **Problem**: Queries that rely on a parent `object_id` being pre-verified sometimes omit the `user_id` filter on child queries. This creates an inconsistent auditing surface — reviewers must trace ownership through multiple hops rather than seeing it asserted in each query.
- **Rule**: Include `.eq("user_id", user.id)` on every query that touches user-owned rows, even when a parent ownership check already ran. Defense-in-depth: RLS is the backstop, not the only guard.
- **Applies to**: plan, implement, impl-review

## Config keys must follow camelCase to avoid mistype risk

- **Context**: Any addition to a shared config object (`storageConfig`, `aiConfig`, etc.) in `src/lib/config.ts`.
- **Problem**: Mixed naming conventions (PascalCase_snake alongside camelCase) in the same object increase mistype risk at callsites. TypeScript catches it, but it adds friction at every new reference.
- **Rule**: All keys in `storageConfig` (and other config objects in `src/lib/config.ts`) must use camelCase. If a pre-existing key deviates, rename it and update callsites before adding new references to it.
- **Applies to**: plan, implement, impl-review
