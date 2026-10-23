package com.pseudovoice.auth.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pseudovoice.auth.dto.request.MemoryCreateDto;
import com.pseudovoice.auth.dto.request.MemorySearchDto;
import com.pseudovoice.auth.dto.response.MemoryResponseDto;
import com.pseudovoice.auth.dto.response.UserMemoryResponseDto;
import com.pseudovoice.auth.dto.response.MemoryContextResponseDto;
import com.pseudovoice.auth.dto.request.UserMemoryWriteDto;
import com.pseudovoice.auth.dto.request.MemoryPreferencesWriteDto;
import com.pseudovoice.auth.dto.request.MemoryExtractionBatchDto;
import com.pseudovoice.auth.dto.request.MemoryCandidateDto;
import lombok.RequiredArgsConstructor;
import com.pseudovoice.auth.dto.response.MemoryPreferencesResponseDto;
import com.pseudovoice.auth.dto.response.MemoryExtractionResultDto;
import com.pseudovoice.auth.dto.response.MemoryActivityResponseDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
public class ConversationMemoryService {
    private static final int DIMENSIONS = 384;
    private final JdbcTemplate jdbc;
    private final MemoryGroupService groups;
    private final MemorySensitiveCryptoService sensitiveCrypto;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private volatile Boolean pgvectorEnabled;

    // Every scope is bounded by the conversation's owner, including 'all'. Both
    // source and target must currently be members for a group memory to apply.
    static final String ACCESSIBLE = """
            user_id = ? AND approved = TRUE AND sensitive = FALSE AND embedding IS NOT NULL AND (
                (scope = 'private' AND character_id = ?) OR
                (scope = 'all' AND EXISTS (SELECT 1 FROM memory_preferences mp WHERE mp.user_id = conversation_memories.user_id AND mp.shared_consent = TRUE)) OR
                (scope = 'group' AND EXISTS (SELECT 1 FROM memory_preferences mp WHERE mp.user_id = conversation_memories.user_id AND mp.shared_consent = TRUE) AND EXISTS (
                    SELECT 1 FROM memory_group_members target
                    JOIN memory_group_members source ON source.group_id = target.group_id
                        AND source.user_id = target.user_id
                    WHERE target.group_id = conversation_memories.group_id
                        AND target.user_id = conversation_memories.user_id
                        AND target.character_id = ? AND source.character_id = conversation_memories.character_id
                ))
            )
            """;

    private final RowMapper<UserMemoryResponseDto> MEMORY_ROW = this::mapMemory;

    private UserMemoryResponseDto mapMemory(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        boolean sensitive = rs.getBoolean("sensitive");
        byte[] ciphertext = rs.getBytes("content_ciphertext");
        String content = sensitive && ciphertext != null ? sensitiveCrypto.decrypt(ciphertext) : rs.getString("content");
        return new UserMemoryResponseDto(rs.getLong("id"), rs.getObject("conversation_id", Integer.class),
                rs.getInt("character_id"), content, rs.getString("scope"), rs.getObject("group_id", Integer.class),
                rs.getBoolean("approved"), rs.getObject("created_at", OffsetDateTime.class), rs.getString("origin"),
                sensitive, rs.getInt("revision"), rs.getObject("updated_at", OffsetDateTime.class));
    }

    @Transactional(readOnly = true)
    public List<UserMemoryResponseDto> list(Integer userId, Integer characterId, Boolean approved) {
        String sql = "SELECT * FROM conversation_memories WHERE user_id = ?";
        List<Object> parameters = new ArrayList<>();
        parameters.add(userId);
        if (characterId != null) { groups.requireOwnedCharacter(userId, characterId); sql += " AND character_id = ?"; parameters.add(characterId); }
        if (approved != null) { sql += " AND approved = ?"; parameters.add(approved); }
        return jdbc.query(sql + " ORDER BY created_at DESC, id DESC", MEMORY_ROW, parameters.toArray());
    }

    @Transactional(readOnly = true)
    public UserMemoryResponseDto get(Integer userId, Long id) {
        var memories = jdbc.query("SELECT * FROM conversation_memories WHERE id = ? AND user_id = ?", MEMORY_ROW, id, userId);
        if (memories.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Recuerdo no encontrado.");
        return memories.getFirst();
    }

    @Transactional
    public UserMemoryResponseDto create(Integer userId, UserMemoryWriteDto request) {
        validateScope(userId, request);
        validateSensitive(userId, request.sensitive(), request.scope());
        Long id = insertMemory(userId, null, request.characterId(), request.content().trim(), request.scope(),
                request.groupId(), request.approved(), "manual", request.sensitive(), request.sensitive() ? null : request.embedding());
        return get(userId, id);
    }

    @Transactional
    public UserMemoryResponseDto update(Integer userId, Long id, UserMemoryWriteDto request) {
        var locked = jdbc.query("SELECT * FROM conversation_memories WHERE id = ? AND user_id = ? FOR UPDATE", MEMORY_ROW, id, userId);
        if (locked.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Recuerdo no encontrado.");
        var previous = locked.getFirst();
        // Conversation attribution is immutable; a proposal cannot be moved to a different source character.
        if (previous.conversationId() != null && !previous.characterId().equals(request.characterId()))
            throw new IllegalArgumentException("El personaje debe coincidir con la conversación original.");
        validateScope(userId, request);
        validateSensitive(userId, request.sensitive(), request.scope());
        String embeddingUpdate = "";
        List<Object> parameters = new ArrayList<>();
        String content = request.sensitive() ? "[Recuerdo sensible protegido]" : request.content().trim();
        parameters.add(request.characterId()); parameters.add(content); parameters.add(request.scope());
        parameters.add(request.groupId()); parameters.add(request.approved());
        parameters.add(request.sensitive());
        parameters.add(request.sensitive() ? sensitiveCrypto.encrypt(request.content().trim()) : null);
        if (!request.sensitive() && request.embedding() != null) {
            embeddingUpdate = ", embedding = CAST(? AS " + (pgvectorAvailable() ? "vector(384)" : "jsonb") + ")";
            parameters.add(vectorLiteral(request.embedding()));
        } else if (request.sensitive() || previous.sensitive() || !previous.content().equals(request.content().trim())) {
            embeddingUpdate = ", embedding = NULL";
        }
        parameters.add(id); parameters.add(userId);
        jdbc.update("UPDATE conversation_memories SET character_id = ?, content = ?, scope = ?, group_id = ?, approved = ?, sensitive = ?, content_ciphertext = ?, origin = 'manual', revision = revision + 1, updated_at = now()" + embeddingUpdate + " WHERE id = ? AND user_id = ?", parameters.toArray());
        return get(userId, id);
    }

    @Transactional
    public void delete(Integer userId, Long id) {
        if (jdbc.update("DELETE FROM conversation_memories WHERE id = ? AND user_id = ?", id, userId) == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Recuerdo no encontrado.");
    }

    @Transactional
    public MemoryPreferencesResponseDto preferences(Integer userId) {
        ensurePreferences(userId);
        return jdbc.queryForObject("SELECT mode, shared_consent, sensitive_consent, updated_at FROM memory_preferences WHERE user_id = ?",
                (rs, n) -> new MemoryPreferencesResponseDto(rs.getString("mode"), rs.getBoolean("shared_consent"),
                        rs.getBoolean("sensitive_consent"), rs.getObject("updated_at", OffsetDateTime.class)), userId);
    }

    @Transactional
    public MemoryPreferencesResponseDto updatePreferences(Integer userId, MemoryPreferencesWriteDto request) {
        ensurePreferences(userId);
        jdbc.update("UPDATE memory_preferences SET mode = ?, shared_consent = ?, sensitive_consent = ?, updated_at = now() WHERE user_id = ?",
                request.mode(), request.sharedConsent(), request.sensitiveConsent(), userId);
        return preferences(userId);
    }

    @Transactional
    public MemoryExtractionResultDto extract(Integer conversationId, MemoryExtractionBatchDto batch) {
        int[] owner = conversationOwner(conversationId);
        ensurePreferences(owner[0]);
        int savedBatch = jdbc.update("""
                INSERT INTO memory_extraction_batches(user_id, conversation_id, batch_key, input_tokens, output_tokens, estimated_cost_usd)
                VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, batch_key) DO NOTHING
                """, owner[0], conversationId, batch.batchKey(), batch.inputTokens(), batch.outputTokens(),
                batch.estimatedCostUsd() == null ? java.math.BigDecimal.ZERO : batch.estimatedCostUsd());
        if (savedBatch == 0) return new MemoryExtractionResultDto(0, 0, 0, true);
        Long batchId = jdbc.queryForObject("SELECT id FROM memory_extraction_batches WHERE user_id = ? AND batch_key = ?",
                Long.class, owner[0], batch.batchKey());
        MemoryPreferencesResponseDto policy = preferences(owner[0]);
        int created = 0, updated = 0, skipped = 0;
        if ("manual".equals(policy.mode())) skipped += batch.candidates() == null ? 0 : batch.candidates().size();
        else if (batch.candidates() != null) {
            for (MemoryCandidateDto candidate : batch.candidates()) {
                String content = candidate.content().trim();
                if (content.isBlank()) {
                    skipped++;
                    continue;
                }
                boolean automatic = "automatic".equals(policy.mode());
                if (candidate.sensitive()) {
                    if (!policy.sensitiveConsent() || !sensitiveCrypto.isConfigured()) { skipped++; continue; }
                    Long memoryId = insertMemory(owner[0], conversationId, owner[1], content, "private", null,
                            automatic, automatic ? "automatic" : "suggested", true, null);
                    addActivity(owner[0], owner[1], memoryId, batchId, "created", automatic ? "automatic" : "suggested", null, 1);
                    created++;
                    continue;
                }
                if (candidate.embedding() == null || !validVector(candidate.embedding())) { skipped++; continue; }
                DuplicateMemory duplicate = findDuplicate(owner[0], owner[1], candidate.embedding());
                if (duplicate != null && "manual".equals(duplicate.origin())) {
                    skipped++;
                    continue;
                }
                if (duplicate != null && automatic) {
                    String snapshot = objectMapper.valueToTree(duplicate).toString();
                    int revision = duplicate.revision() + 1;
                    int changed = jdbc.update("""
                            UPDATE conversation_memories SET content = ?, embedding = CAST(? AS %s), approved = TRUE,
                                origin = 'automatic', revision = ?, updated_at = now()
                            WHERE id = ? AND user_id = ? AND revision = ? AND origin <> 'manual'
                            """.formatted(pgvectorAvailable() ? "vector(384)" : "jsonb"), content,
                            pgvectorAvailable() ? vectorLiteral(candidate.embedding()) : vectorJson(candidate.embedding()),
                            revision, duplicate.id(), owner[0], duplicate.revision());
                    if (changed == 0) { skipped++; continue; }
                    addActivity(owner[0], owner[1], duplicate.id(), batchId, "updated", "automatic", snapshot, revision);
                    updated++;
                } else if (duplicate != null) {
                    skipped++;
                } else {
                    boolean approved = automatic;
                    Long memoryId = insertMemory(owner[0], conversationId, owner[1], content, "private", null,
                            approved, automatic ? "automatic" : "suggested", false, candidate.embedding());
                    addActivity(owner[0], owner[1], memoryId, batchId, "created", automatic ? "automatic" : "suggested", null, 1);
                    created++;
                }
            }
        }
        jdbc.update("UPDATE memory_extraction_batches SET memories_created = ?, memories_updated = ?, memories_skipped = ? WHERE id = ?",
                created, updated, skipped, batchId);
        return new MemoryExtractionResultDto(created, updated, skipped, false);
    }

    @Transactional(readOnly = true)
    public List<MemoryActivityResponseDto> activity(Integer userId, int limit) {
        return jdbc.query("""
                SELECT a.id, a.memory_id, a.character_id, a.action, a.source,
                       COALESCE(m.content, a.snapshot->>'content', '') AS preview,
                       (a.action IN ('created','updated') AND a.source IN ('automatic','suggested') AND a.undone_at IS NULL
                           AND m.id IS NOT NULL AND m.revision = a.expected_revision) AS undo_available,
                       a.context_items, a.context_tokens_estimate, a.created_at
                FROM memory_activity a LEFT JOIN conversation_memories m ON m.id = a.memory_id AND m.user_id = a.user_id
                WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT ?
                """, (rs, n) -> new MemoryActivityResponseDto(rs.getLong("id"), rs.getObject("memory_id", Long.class),
                rs.getObject("character_id", Integer.class), rs.getString("action"), rs.getString("source"),
                rs.getString("preview"), rs.getBoolean("undo_available"), rs.getInt("context_items"),
                rs.getInt("context_tokens_estimate"), rs.getObject("created_at", OffsetDateTime.class)), userId,
                Math.max(1, Math.min(limit, 100)));
    }

    @Transactional
    public void undo(Integer userId, Long activityId) {
        var rows = jdbc.query("SELECT * FROM memory_activity WHERE id = ? AND user_id = ? FOR UPDATE", (rs, n) -> new Object[]{
                rs.getLong("id"), rs.getObject("memory_id", Long.class), rs.getString("action"), rs.getString("source"),
                rs.getString("snapshot"), rs.getObject("expected_revision", Integer.class), rs.getObject("undone_at", OffsetDateTime.class)
        }, activityId, userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "La actividad no existe.");
        Object[] event = rows.getFirst();
        Long memoryId = (Long) event[1];
        String action = (String) event[2], source = (String) event[3];
        if (!("created".equals(action) || "updated".equals(action)) || !("automatic".equals(source) || "suggested".equals(source)) || event[6] != null)
            throw new IllegalArgumentException("Esta actividad ya fue deshecha o no admite deshacer.");
        Integer expectedRevision = (Integer) event[5];
        var current = jdbc.query("SELECT revision, character_id FROM conversation_memories WHERE id = ? AND user_id = ? FOR UPDATE",
                (rs, n) -> new int[]{rs.getInt("revision"), rs.getInt("character_id")}, memoryId, userId);
        if (current.isEmpty() || current.getFirst()[0] != expectedRevision)
            throw new IllegalStateException("El recuerdo cambió desde la extracción; no se modificó para evitar perder una edición posterior.");
        Integer characterId = current.getFirst()[1];
        if ("created".equals(action)) {
            jdbc.update("DELETE FROM conversation_memories WHERE id = ? AND user_id = ?", memoryId, userId);
        } else {
            try {
                var snapshot = objectMapper.readTree((String) event[4]);
                String embedding = snapshot.path("embedding").asText("");
                String embeddingUpdate = embedding.isBlank() || "null".equals(embedding)
                        ? "embedding = NULL" : "embedding = CAST(? AS " + (pgvectorAvailable() ? "vector(384)" : "jsonb") + ")";
                List<Object> args = new ArrayList<>(List.of(snapshot.path("content").asText(),
                        snapshot.path("scope").asText("private"), snapshot.path("approved").asBoolean(),
                        snapshot.path("origin").asText("suggested"), expectedRevision + 1, memoryId, userId));
                if (!embeddingUpdate.endsWith("NULL")) args.add(5, embedding);
                jdbc.update("UPDATE conversation_memories SET content = ?, scope = ?, approved = ?, origin = ?, revision = ?, updated_at = now(), " + embeddingUpdate + " WHERE id = ? AND user_id = ?", args.toArray());
            } catch (Exception exception) {
                throw new IllegalStateException("No se pudo restaurar la versión anterior del recuerdo.", exception);
            }
        }
        jdbc.update("UPDATE memory_activity SET undone_at = now() WHERE id = ? AND user_id = ?", activityId, userId);
        jdbc.update("INSERT INTO memory_activity(user_id, character_id, memory_id, action, source, related_activity_id) VALUES (?, ?, ?, 'undone', 'system', ?)",
                userId, characterId, memoryId, activityId);
    }

    @Transactional(readOnly = true)
    public java.util.Map<String, Object> usage(Integer userId) {
        return jdbc.queryForMap("""
                SELECT COALESCE(SUM(input_tokens), 0)::BIGINT AS extraction_input_tokens,
                       COALESCE(SUM(output_tokens), 0)::BIGINT AS extraction_output_tokens,
                       COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC AS extraction_cost_usd,
                       COALESCE(SUM(memories_created), 0)::BIGINT AS created,
                       COALESCE(SUM(memories_updated), 0)::BIGINT AS updated,
                       COALESCE(SUM(memories_skipped), 0)::BIGINT AS skipped,
                       COALESCE((SELECT SUM(context_tokens_estimate) FROM memory_activity WHERE user_id = ?), 0)::BIGINT AS retrieval_tokens_estimate
                FROM memory_extraction_batches WHERE user_id = ?
                """, userId, userId);
    }

    private void validateScope(Integer userId, UserMemoryWriteDto request) {
        groups.requireOwnedCharacter(userId, request.characterId());
        if (!List.of("private", "group", "all").contains(request.scope())) throw new IllegalArgumentException("Alcance inválido.");
        if (!"private".equals(request.scope()) && !preferences(userId).sharedConsent())
            throw new IllegalArgumentException("Activa el consentimiento para compartir recuerdos antes de cambiar su alcance.");
        if (request.sensitive() && (!"private".equals(request.scope()) || request.embedding() != null))
            throw new IllegalArgumentException("Los recuerdos sensibles solo se pueden guardar como privados y sin embedding.");
        if ("group".equals(request.scope())) {
            if (request.groupId() == null) throw new IllegalArgumentException("El grupo es obligatorio.");
            groups.lockOwnedGroup(userId, request.groupId());
            if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM memory_group_members WHERE group_id = ? AND user_id = ? AND character_id = ?)",
                    Boolean.class, request.groupId(), userId, request.characterId()))) throw new IllegalArgumentException("El personaje no pertenece al grupo.");
        } else if (request.groupId() != null) throw new IllegalArgumentException("Solo el alcance group admite un grupo.");
        if (request.embedding() != null && !validVector(request.embedding())) throw new IllegalArgumentException("Embedding inválido.");
    }

    private void validateSensitive(Integer userId, boolean sensitive, String scope) {
        if (!sensitive) return;
        if (!preferences(userId).sensitiveConsent()) throw new IllegalArgumentException("Activa el consentimiento para guardar recuerdos sensibles.");
        if (!"private".equals(scope)) throw new IllegalArgumentException("Un recuerdo sensible solo puede tener alcance privado.");
        if (!sensitiveCrypto.isConfigured()) throw new IllegalStateException("Configura MEMORY_ENCRYPTION_KEY en el servidor para guardar recuerdos sensibles.");
    }

    private void ensurePreferences(Integer userId) {
        jdbc.update("INSERT INTO memory_preferences(user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING", userId);
    }

    private Long insertMemory(Integer userId, Integer conversationId, Integer characterId, String content,
                              String scope, Integer groupId, boolean approved, String origin,
                              boolean sensitive, List<Float> embedding) {
        if (sensitive && embedding != null) throw new IllegalArgumentException("Los recuerdos sensibles no pueden generar embeddings.");
        String embeddingType = pgvectorAvailable() ? "vector(384)" : "jsonb";
        String storedContent = sensitive ? "[Recuerdo sensible protegido]" : content;
        byte[] ciphertext = sensitive ? sensitiveCrypto.encrypt(content) : null;
        String vector = embedding == null ? null : (pgvectorAvailable() ? vectorLiteral(embedding) : vectorJson(embedding));
        return jdbc.queryForObject("""
                INSERT INTO conversation_memories(conversation_id, user_id, character_id, content, scope, group_id,
                    approved, embedding, origin, sensitive, content_ciphertext)
                VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS %s), ?, ?, CAST(? AS bytea)) RETURNING id
                """.formatted(embeddingType), Long.class, conversationId, userId, characterId, storedContent, scope,
                groupId, approved, vector, origin, sensitive, ciphertext);
    }

    private String vectorJson(List<Float> vector) {
        return vector == null ? null : vectorLiteral(vector);
    }

    private void addActivity(Integer userId, Integer characterId, Long memoryId, Long batchId, String action,
                             String source, String snapshot, Integer expectedRevision) {
        jdbc.update("""
                INSERT INTO memory_activity(user_id, character_id, memory_id, batch_id, action, source, snapshot, expected_revision)
                VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
                """, userId, characterId, memoryId, batchId, action, source, snapshot, expectedRevision);
    }

    private DuplicateMemory findDuplicate(Integer userId, Integer characterId, List<Float> embedding) {
        List<DuplicateMemory> matches = jdbc.query("""
                SELECT id, content, embedding::text AS embedding, origin, approved, revision
                FROM conversation_memories
                WHERE user_id = ? AND character_id = ? AND scope = 'private' AND sensitive = FALSE AND embedding IS NOT NULL
                ORDER BY updated_at DESC LIMIT 300
                """, (rs, n) -> new DuplicateMemory(rs.getLong("id"), rs.getString("content"),
                rs.getString("embedding"), rs.getString("origin"), rs.getBoolean("approved"), rs.getInt("revision")),
                userId, characterId);
        DuplicateMemory best = null;
        double bestSimilarity = 0.91;
        for (DuplicateMemory memory : matches) {
            try {
                List<Float> stored = objectMapper.readValue(memory.embedding(), new TypeReference<>() {});
                double similarity = cosine(embedding, stored);
                if (similarity >= bestSimilarity) { best = memory; bestSimilarity = similarity; }
            } catch (Exception ignored) { }
        }
        return best;
    }

    private record DuplicateMemory(Long id, String content, String embedding, String origin, boolean approved, int revision) {}

    private int[] conversationOwner(Integer conversationId) {
        var owner = jdbc.query("""
                SELECT c.user_id, c.character_id FROM conversations c
                JOIN voice_characters vc ON vc.id = c.character_id AND vc.user_id = c.user_id
                WHERE c.id = ?
                """, rs -> rs.next() ? new int[]{rs.getInt("user_id"), rs.getInt("character_id")} : null, conversationId);
        if (owner == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "La conversación no existe o su personaje no corresponde al propietario.");
        return owner;
    }

    @Transactional(readOnly = true)
    public MemoryContextResponseDto context(Integer conversationId) {
        int[] owner = conversationOwner(conversationId);
        var groupIds = jdbc.queryForList("SELECT group_id FROM memory_group_members WHERE user_id = ? AND character_id = ? ORDER BY group_id",
                Integer.class, owner[0], owner[1]);
        var memberships = groupIds.stream().map(id -> groups.get(owner[0], id)).toList();
        var shared = memberships.stream().map(g -> g.personalityInstructions()).filter(s -> s != null && !s.isBlank()).toList();
        var individual = jdbc.queryForList("""
                SELECT r.prompt_description FROM character_rules cr JOIN rules_catalog r ON r.id = cr.rule_id
                WHERE cr.character_id = ? AND (r.user_id IS NULL OR r.user_id = ?)
                ORDER BY cr.priority ASC, r.id
                """, String.class, owner[1], owner[0]).stream().filter(s -> s != null && !s.isBlank()).toList();
        var character = jdbc.queryForMap("SELECT reference_audio_path, personality_prompt, character_name FROM voice_characters WHERE id = ? AND user_id = ?", owner[1], owner[0]);
        String reference = (String) character.get("reference_audio_path");
        String personalityPrompt = (String) character.get("personality_prompt");
        // Shared personality supplements each character's own rules; it never replaces them.
        var effective = new ArrayList<String>(individual);
        effective.addAll(shared);
        var memories = jdbc.queryForList("SELECT content FROM conversation_memories WHERE "
                + ACCESSIBLE.replace(" AND embedding IS NOT NULL", "")
                + " ORDER BY updated_at DESC, id DESC LIMIT 100", String.class, owner[0], owner[1], owner[1]);
        String userName = jdbc.queryForObject("SELECT full_name FROM users WHERE id = ?", String.class, owner[0]);
        var rules = jdbc.queryForList("""
                SELECT cr.id, r.category, r.rule_code AS code, r.rule_code AS "shortLabel",
                    r.prompt_description AS description, cr.priority, TRUE AS "isActive"
                FROM character_rules cr JOIN rules_catalog r ON r.id = cr.rule_id
                WHERE cr.character_id = ? AND (r.user_id IS NULL OR r.user_id = ?)
                ORDER BY cr.priority ASC, r.id
                """, owner[1], owner[0]);
        return new MemoryContextResponseDto(owner[0], owner[1], reference, personalityPrompt, shared, memberships, individual, effective,
                userName, (String) character.get("character_name"), memories,
                rules);
    }

    @Transactional
    public MemoryPreferencesResponseDto conversationPolicy(Integer conversationId) {
        int[] owner = conversationOwner(conversationId);
        return preferences(owner[0]);
    }

    @Transactional
    public void remember(Integer conversationId, MemoryCreateDto request) {
        if (!validVector(request.embedding())) throw new IllegalArgumentException("Embedding inválido.");
        var owner = conversationOwner(conversationId);
        if (!Integer.valueOf(owner[1]).equals(request.characterId())) throw new IllegalArgumentException("El personaje no pertenece a esta conversación.");

        try {
            if (pgvectorAvailable()) {
                jdbc.update("""
                        INSERT INTO conversation_memories (conversation_id, user_id, character_id, content, embedding, scope, approved)
                        VALUES (?, ?, ?, ?, CAST(? AS vector(384)), 'private', FALSE)
                        """, conversationId, owner[0], owner[1], request.content().trim(), vectorLiteral(request.embedding()));
                return;
            }
            jdbc.update("""
                    INSERT INTO conversation_memories (conversation_id, user_id, character_id, content, embedding, scope, approved)
                    VALUES (?, ?, ?, ?, CAST(? AS jsonb), 'private', FALSE)
                    """, conversationId, owner[0], owner[1], request.content().trim(), objectMapper.writeValueAsString(request.embedding()));
        } catch (Exception exception) {
            throw new IllegalStateException("No se pudo guardar el recuerdo conversacional.", exception);
        }
    }

    @Transactional
    public List<MemoryResponseDto> search(Integer conversationId, MemorySearchDto request) {
        if (!validVector(request.embedding())) throw new IllegalArgumentException("Embedding inválido.");
        var owner = conversationOwner(conversationId);

        int limit = Math.max(1, Math.min(request.limit() == null ? 5 : request.limit(), 10));
        List<MemoryResponseDto> ranked = new ArrayList<>();
        if (pgvectorAvailable()) {
            String queryVector = vectorLiteral(request.embedding());
            List<MemoryResponseDto> result = jdbc.query("""
                            SELECT id, content, 1 - (embedding <=> CAST(? AS vector(384))) AS similarity
                            FROM conversation_memories
                            WHERE %s
                            ORDER BY embedding <=> CAST(? AS vector(384))
                            LIMIT ?
                            """.formatted(ACCESSIBLE),
                    (rs, rowNum) -> new MemoryResponseDto(
                            rs.getLong("id"), rs.getString("content"), rs.getDouble("similarity")),
                    queryVector, owner[0], owner[1], owner[1], queryVector, limit
            ).stream().filter(memory -> memory.similarity() > 0.15).toList();
            recordRetrieval(owner, result);
            return result;
        }
        jdbc.query("""
                SELECT id, content, embedding::text AS embedding
                FROM conversation_memories
                WHERE %s
                ORDER BY created_at DESC
                LIMIT 300
                """.formatted(ACCESSIBLE), rs -> {
            try {
                List<Float> vector = objectMapper.readValue(rs.getString("embedding"), new TypeReference<>() {});
                double similarity = cosine(request.embedding(), vector);
                if (similarity > 0.15) ranked.add(new MemoryResponseDto(rs.getLong("id"), rs.getString("content"), similarity));
            } catch (Exception exception) {
                throw new IllegalStateException("No se pudo leer un embedding guardado.", exception);
            }
        }, owner[0], owner[1], owner[1]);
        List<MemoryResponseDto> result = ranked.stream().sorted((a, b) -> Double.compare(b.similarity(), a.similarity())).limit(limit).toList();
        recordRetrieval(owner, result);
        return result;
    }

    private void recordRetrieval(int[] owner, List<MemoryResponseDto> memories) {
        int estimatedTokens = memories.stream().mapToInt(memory -> Math.max(1, memory.content().length() / 4)).sum();
        jdbc.update("""
                INSERT INTO memory_activity(user_id, character_id, action, source, context_items, context_tokens_estimate)
                VALUES (?, ?, 'retrieved', 'system', ?, ?)
                """, owner[0], owner[1], memories.size(), estimatedTokens);
    }

    private boolean validVector(List<Float> vector) {
        return vector != null && vector.size() == DIMENSIONS
                && vector.stream().allMatch(v -> v != null && Float.isFinite(v))
                && vector.stream().mapToDouble(v -> (double) v * v).sum() > 0;
    }

    private boolean pgvectorAvailable() {
        Boolean available = pgvectorEnabled;
        if (available == null) {
            synchronized (this) {
                available = pgvectorEnabled;
                if (available == null) {
                    available = Boolean.TRUE.equals(jdbc.queryForObject("""
                            SELECT EXISTS (
                                SELECT 1 FROM information_schema.columns
                                WHERE table_schema = current_schema()
                                  AND table_name = 'conversation_memories'
                                  AND column_name = 'embedding'
                                  AND udt_name = 'vector'
                            )
                            """, Boolean.class));
                    pgvectorEnabled = available;
                }
            }
        }
        return available;
    }

    private String vectorLiteral(List<Float> vector) {
        return "[" + String.join(",", vector.stream().map(value -> Float.toString(value)).toList()) + "]";
    }

    private double cosine(List<Float> left, List<Float> right) {
        if (right.size() != DIMENSIONS) return -1;
        double dot = 0, leftNorm = 0, rightNorm = 0;
        for (int i = 0; i < DIMENSIONS; i++) {
            double a = left.get(i), b = right.get(i);
            dot += a * b;
            leftNorm += a * a;
            rightNorm += b * b;
        }
        return leftNorm == 0 || rightNorm == 0 ? -1 : dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
    }
}
