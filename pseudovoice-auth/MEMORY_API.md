# Memory and group API

User routes require a Bearer JWT with USER role. No request accepts a userId: ownership comes from the principal. Foreign/missing resources return 404; invalid scopes/memberships return 400. Responses are plain JSON DTOs (no ApiResponse wrapper). IDs for memories are 64-bit, characters/groups are 32-bit.

`GET /api/auth/me` with `Authorization: Bearer <JWT>` returns `{ "userId": 1 }` (USER or ADMIN). Python resolves HTTP `X-User-Authorization: Bearer <JWT>` or WS `session_config.user_token` by forwarding the bearer to this route. Do not combine an internal key with a user bearer on this request.

## User memories

- `GET /api/memory-settings` returns all owned memories, including pending legacy memories; optional `characterId`, `approved` filters.
- `GET /api/memory-settings/{id}` returns one owned memory.
- `POST /api/memory-settings` creates a memory (201).
- `PUT /api/memory-settings/{id}` replaces editable fields.
- `DELETE /api/memory-settings/{id}` deletes it (204).
- `GET /api/memory-settings/preferences` and `PUT` read or save `{ "mode": "automatic|suggested|manual", "sharedConsent": false, "sensitiveConsent": false }`.
- `GET /api/memory-settings/activity?limit=50` lists automatic changes and retrieval usage; `POST /api/memory-settings/activity/{id}/undo` reverts an untouched automatic change (204).
- `GET /api/memory-settings/usage` returns extraction tokens, cost estimate, retrieval-token estimate and batch totals.

POST/PUT body: `{ "characterId": 12, "content": "Prefiere respuestas breves", "scope": "private", "groupId": null, "approved": true, "embedding": null, "sensitive": false }`.

`characterId` is the source character and must belong to the JWT user. `scope` is exactly `private`, `group`, or `all`. `groupId` is required only for `group`, and the source character must be a member. `approved` is required: only user routes can approve. `embedding` is optional, or 384 finite floats with nonzero norm. Changing content without providing a new embedding clears the old embedding; memories without embeddings are excluded from semantic search until re-embedded through a user update. Unchanged content preserves its embedding when omitted.

Response also includes `origin`, `sensitive`, `revision`, and `updatedAt`. Sensitive content requires `sensitiveConsent`, is private only, has no embedding, and is encrypted with the Spring `MEMORY_ENCRYPTION_KEY` (Base64-encoded 32-byte key). It is never returned by semantic retrieval. User-created memories have null conversationId. Embeddings and ciphertext are never included in responses. A proposal's source character cannot be changed because it must stay consistent with its original conversation.

Memory mode defaults to `suggested` for existing users. `automatic` approves private extracted memories; `manual` skips extraction. Cross-character retrieval requires `sharedConsent` and the memory's own `group`/`all` scope. Revoking `sharedConsent` immediately stops shared retrieval while leaving the memories available for owner management.

Scopes always stay within the owner: private = source character only; group = current members of that group; all = all of that user's characters. Removing a source character from a group makes its group memories inaccessible until it rejoins or the user edits their scope. Deleting a group preserves its memories as private with approval revoked.

## Groups

- `GET /api/memory-groups` lists owned groups.
- `GET /api/memory-groups/{id}` reads a group.
- `POST /api/memory-groups` creates (201).
- `PUT /api/memory-groups/{id}` replaces name, instructions and membership.
- `DELETE /api/memory-groups/{id}` deletes (204).

POST/PUT body: `{ "name": "Amigos", "personalityInstructions": "Tono cálido", "characterIds": [12, 13] }`. Instructions are optional (null/blank clears); characterIds is required, may be empty, maximum 100 distinct owned characters. A character may belong to multiple groups.

Response: `{ "id": 7, "name": "Amigos", "personalityInstructions": "Tono cálido", "characterIds": [12, 13] }`.

## Internal service

Require the existing `X-Internal-Service-Key` authentication, not a USER JWT.

- `POST /api/memories/conversation/{conversationId}` accepts existing `{ "characterId": 12, "content": "...", "embedding": [384 floats] }`. Returns 201 `{ "status": "proposed" }`. Owner/source are resolved from the conversation; mismatched character is rejected. Approval and sharing cannot be supplied by the service.
- `POST /api/memories/conversation/{conversationId}/search` accepts `{ "embedding": [384 floats], "limit": 5 }`, limit 1..10. Returns existing `[{ "id": 123, "content": "...", "similarity": 0.98 }]`, only approved scoped memories, cosine similarity > .15. Supports existing JSONB and vector storage.
- `GET /api/memories/conversation/{conversationId}/policy` resolves the owner's current mode and consent choices for the Python batch extractor.
- `POST /api/memories/conversation/{conversationId}/extract` accepts an idempotent `batchKey`, input/output token counts, estimated cost, and at most 12 extracted candidates. Spring chooses approval and scope from the saved policy, performs owner/persona-local deduplication, records undo snapshots, and never allows the extractor to choose a shared scope.
- `GET /api/memories/conversation/{conversationId}/context` returns `{ "userId": 1, "characterId": 12, "referenceAudioPath": "saved-reference", "sharedInstructions": ["..."], "groups": [group DTOs], "individualInstructions": ["..."], "effectiveInstructions": ["..."] }`. The reference is resolved from the stored character, never from a session input. Only groups owned by the conversation owner and containing its character are returned. sharedInstructions contains their nonblank personality instructions. Individual instructions are the character's assigned catalog rules in descending priority, with rule ID as stable tie breaker. If any exist, they take precedence over group personality instructions; otherwise group instructions apply in group ID order. This endpoint must be fetched for each turn to observe membership changes. Python must compare userId against `/api/auth/me`, characterId against the selected character, and referenceAudioPath against the owned voice before reading/writing conversation context.

Migration V5 preserves existing content and embeddings, marking legacy rows private and unapproved. V8 adds preferences, activity, extraction accounting, encrypted sensitive-memory storage, and keeps memories after their source conversation is deleted. SQL initialization scripts are idempotent on restart. No existing migration is rewritten.

## Character provider metadata

Existing `POST /api/characters/user/{userId}` and `PUT /api/characters/{characterId}` accept optional `providerSource` (`local|fish|catalog`), `providerVoiceId` (max 255), `catalogOriginalName` (max 255), `catalogImageUrl` (HTTPS, max 2048). Character responses include these fields. Existing clients may omit them; null on update preserves previous metadata. A blank catalogImageUrl clears it. Existing USER checks protect creation, updates and deletion. V6 adds nullable columns without changing existing references. Metadata describes catalog origin; it does not grant permission to use a private provider voice. Python must enforce its local provider voice ownership registry.
