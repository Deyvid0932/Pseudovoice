package com.pseudovoice.auth.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pseudovoice.auth.dto.request.AgentApprovalCreateDto;
import com.pseudovoice.auth.dto.request.AgentContactGrantWriteDto;
import com.pseudovoice.auth.dto.request.AgentPreferencesWriteDto;
import com.pseudovoice.auth.dto.request.AgentStepWriteDto;
import com.pseudovoice.auth.dto.request.AgentTaskCreateInternalDto;
import com.pseudovoice.auth.dto.request.AgentTaskStatusWriteDto;
import com.pseudovoice.auth.dto.response.AgentApprovalResponseDto;
import com.pseudovoice.auth.dto.response.AgentPreferencesResponseDto;
import com.pseudovoice.auth.dto.response.AgentStepResponseDto;
import com.pseudovoice.auth.dto.response.AgentTaskResponseDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.Locale;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AgentAutomationService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    private final RowMapper<AgentPreferencesResponseDto> preferencesMapper = (rs, n) -> new AgentPreferencesResponseDto(
            rs.getBoolean("enabled"), rs.getBoolean("allow_public_navigation"),
            rs.getBoolean("allow_authenticated_navigation"), rs.getBoolean("allow_read"),
            rs.getBoolean("allow_form_fill"), rs.getBoolean("allow_downloads"),
            rs.getBoolean("allow_uploads"), rs.getBoolean("allow_modifications"),
            rs.getBoolean("whatsapp_enabled"), rs.getString("authorization_mode"), rs.getInt("max_steps"),
            rs.getBigDecimal("deepseek_budget_usd"), rs.getBigDecimal("fish_budget_usd"),
            rs.getObject("updated_at", OffsetDateTime.class), rs.getBoolean("auto_approve_public_navigation"),
            decodeNavigationOrigins(rs.getString("public_navigation_origins")));
    private final RowMapper<AgentTaskResponseDto> taskMapper = (rs, n) -> new AgentTaskResponseDto(
            rs.getLong("id"), rs.getObject("run_id", UUID.class), rs.getObject("character_id", Integer.class),
            rs.getString("character_name"), rs.getObject("conversation_id", Integer.class), rs.getString("title"), rs.getString("status"),
            rs.getString("summary"), rs.getString("error_code"), rs.getInt("step_count"),
            rs.getInt("input_tokens"), rs.getInt("output_tokens"), rs.getBigDecimal("deepseek_cost_usd"),
            rs.getBigDecimal("fish_cost_usd"), rs.getObject("created_at", OffsetDateTime.class),
            rs.getObject("updated_at", OffsetDateTime.class), rs.getObject("finished_at", OffsetDateTime.class));
    private final RowMapper<AgentStepResponseDto> stepMapper = (rs, n) -> new AgentStepResponseDto(
            rs.getLong("id"), rs.getInt("sequence"), rs.getString("tool_name"), rs.getString("action_class"),
            rs.getString("target_origin"), rs.getString("status"), rs.getString("summary"),
            rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class));
    private final RowMapper<AgentApprovalResponseDto> approvalMapper = (rs, n) -> new AgentApprovalResponseDto(
            rs.getLong("id"), rs.getLong("task_id"), rs.getLong("step_id"), rs.getInt("character_id"),
            rs.getString("character_name"), rs.getString("action_label"), rs.getString("destination"),
            rs.getString("payload_json"), rs.getString("payload_hash"), rs.getString("status"), rs.getObject("expires_at", OffsetDateTime.class),
            rs.getObject("created_at", OffsetDateTime.class));

    @Transactional
    public AgentPreferencesResponseDto preferences(Integer userId) {
        jdbc.update("INSERT INTO agent_preferences(user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING", userId);
        return jdbc.queryForObject("SELECT * FROM agent_preferences WHERE user_id = ?", preferencesMapper, userId);
    }

    @Transactional
    public AgentPreferencesResponseDto updatePreferences(Integer userId, AgentPreferencesWriteDto request) {
        if (Boolean.TRUE.equals(request.whatsappEnabled()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El envío por WhatsApp no está habilitado en esta fase.");
        List<String> origins = request.publicNavigationOrigins() == null ? List.of() : request.publicNavigationOrigins().stream()
                .map(this::normalizeNavigationOrigin).distinct().toList();
        if (Boolean.TRUE.equals(request.autoApprovePublicNavigation()) && origins.isEmpty())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Añade al menos un sitio HTTPS para la navegación sin confirmación.");
        preferences(userId);
        jdbc.update("""
                UPDATE agent_preferences SET enabled = ?, allow_public_navigation = ?, allow_authenticated_navigation = ?,
                    allow_read = ?, allow_form_fill = ?, allow_downloads = ?, allow_uploads = ?, allow_modifications = ?,
                    whatsapp_enabled = ?, authorization_mode = ?, max_steps = ?, deepseek_budget_usd = ?, fish_budget_usd = ?,
                    auto_approve_public_navigation = ?, public_navigation_origins = ?, updated_at = now()
                WHERE user_id = ?
                """, request.enabled(), request.allowPublicNavigation(), request.allowAuthenticatedNavigation(),
                request.allowRead(), request.allowFormFill(), request.allowDownloads(), request.allowUploads(),
                request.allowModifications(), false, request.authorizationMode(), request.maxSteps(),
                request.deepseekBudgetUsd(), request.fishBudgetUsd(), Boolean.TRUE.equals(request.autoApprovePublicNavigation()),
                encodeNavigationOrigins(origins), userId);
        return preferences(userId);
    }

    private String normalizeNavigationOrigin(String value) {
        try {
            URI uri = URI.create(value.trim());
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))
                    || !host.contains(".") || host.equalsIgnoreCase("localhost")) throw new IllegalArgumentException();
            return "https://" + host.toLowerCase(Locale.ROOT) + (uri.getPort() == -1 || uri.getPort() == 443 ? "" : ":" + uri.getPort());
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Introduce sitios HTTPS sin rutas, por ejemplo https://www.google.com.");
        }
    }

    private List<String> decodeNavigationOrigins(String value) {
        try { return List.of(objectMapper.readValue(value, String[].class)); }
        catch (Exception exception) { return List.of(); }
    }

    private String encodeNavigationOrigins(List<String> values) {
        try { return objectMapper.writeValueAsString(values); }
        catch (JsonProcessingException exception) { throw new IllegalArgumentException("No se pudieron guardar los sitios permitidos."); }
    }

    @Transactional(readOnly = true)
    public List<AgentTaskResponseDto> listTasks(Integer userId, int limit) {
        int bounded = Math.min(100, Math.max(1, limit));
        return jdbc.query("SELECT t.*, c.character_name AS character_name FROM agent_tasks t JOIN voice_characters c ON c.id = t.character_id WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT ?", taskMapper, userId, bounded);
    }

    @Transactional(readOnly = true)
    public AgentTaskResponseDto getTask(Integer userId, long id) {
        var rows = jdbc.query("SELECT t.*, c.character_name AS character_name FROM agent_tasks t JOIN voice_characters c ON c.id = t.character_id WHERE t.id = ? AND t.user_id = ?", taskMapper, id, userId);
        if (rows.isEmpty()) throw notFound("Tarea no encontrada.");
        return rows.getFirst();
    }

    @Transactional(readOnly = true)
    public AgentTaskResponseDto getInternalTask(long id) {
        return taskById(id);
    }

    @Transactional(readOnly = true)
    public List<AgentStepResponseDto> steps(Integer userId, long taskId) {
        getTask(userId, taskId);
        return jdbc.query("SELECT s.* FROM agent_task_steps s JOIN agent_tasks t ON t.id = s.task_id WHERE t.id = ? AND t.user_id = ? ORDER BY s.sequence",
                stepMapper, taskId, userId);
    }

    @Transactional(readOnly = true)
    public List<AgentApprovalResponseDto> pendingApprovals(Integer userId) {
        return jdbc.query("""
                SELECT a.id, a.task_id, a.step_id, a.character_id, c.character_name AS character_name, a.action_label,
                       a.destination, a.payload::text AS payload_json, a.payload_hash, a.status, a.expires_at, a.created_at
                FROM agent_approvals a JOIN agent_tasks t ON t.id = a.task_id
                JOIN voice_characters c ON c.id = a.character_id
                WHERE a.user_id = ? AND a.status = 'pending' AND a.expires_at > now()
                ORDER BY a.created_at
                """, approvalMapper, userId);
    }

    @Transactional
    public AgentApprovalResponseDto decideApproval(Integer userId, long taskId, long approvalId, boolean approve) {
        getTask(userId, taskId);
        String state = approve ? "approved" : "rejected";
        int changed = jdbc.update("UPDATE agent_approvals SET status = ?, decided_at = now() WHERE id = ? AND task_id = ? AND user_id = ? AND status = 'pending' AND expires_at > now()",
                state, approvalId, taskId, userId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "La autorización venció o ya fue utilizada.");
        if (!approve) {
            jdbc.update("UPDATE agent_task_steps SET status = 'skipped', summary = 'Acción rechazada por el usuario.', updated_at = now() WHERE id = (SELECT step_id FROM agent_approvals WHERE id = ?)", approvalId);
            jdbc.update("UPDATE agent_tasks SET status = 'interrupted', summary = 'La acción pendiente fue rechazada.', updated_at = now() WHERE id = ? AND user_id = ? AND status = 'awaiting_approval'", taskId, userId);
        }
        return jdbc.queryForObject("""
                SELECT a.id, a.task_id, a.step_id, a.character_id, c.character_name AS character_name, a.action_label,
                       a.destination, a.payload::text AS payload_json, a.payload_hash, a.status, a.expires_at, a.created_at
                FROM agent_approvals a JOIN voice_characters c ON c.id = a.character_id
                WHERE a.id = ? AND a.user_id = ?
                """, approvalMapper, approvalId, userId);
    }

    @Transactional
    public AgentTaskResponseDto cancelTask(Integer userId, long taskId) {
        getTask(userId, taskId);
        int changed = jdbc.update("UPDATE agent_tasks SET status = 'cancelled', summary = 'Detención solicitada por el usuario.', updated_at = now(), finished_at = now() WHERE id = ? AND user_id = ? AND status IN ('queued','running','awaiting_approval','interrupted')",
                taskId, userId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "La tarea ya terminó.");
        jdbc.update("UPDATE agent_approvals SET status = 'expired' WHERE task_id = ? AND user_id = ? AND status IN ('pending','approved')", taskId, userId);
        return getTask(userId, taskId);
    }

    @Transactional
    public AgentTaskResponseDto interruptTask(Integer userId, long taskId) {
        getTask(userId, taskId);
        int changed = jdbc.update("UPDATE agent_tasks SET status = 'interrupted', summary = 'La aplicación se cerró; revisa los pasos antes de iniciar otra ejecución.', error_code = 'desktop_closed', updated_at = now(), finished_at = now() WHERE id = ? AND user_id = ? AND status IN ('queued','running','awaiting_approval')", taskId, userId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "La tarea ya terminó.");
        jdbc.update("UPDATE agent_task_steps SET status = 'uncertain', summary = 'La aplicación se cerró durante esta acción; verifica si tuvo efecto.', updated_at = now() WHERE task_id = ? AND status = 'running'", taskId);
        jdbc.update("UPDATE agent_task_steps SET status = 'skipped', summary = 'La tarea se interrumpió antes de ejecutar la acción.', updated_at = now() WHERE task_id = ? AND status IN ('planned','awaiting_approval')", taskId);
        jdbc.update("UPDATE agent_approvals SET status = 'expired' WHERE task_id = ? AND user_id = ? AND status IN ('pending','approved')", taskId, userId);
        return getTask(userId, taskId);
    }

    @Transactional
    public AgentTaskResponseDto createTask(AgentTaskCreateInternalDto request) {
        AgentPreferencesResponseDto prefs = preferences(request.userId());
        if (!prefs.enabled()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El modo agente está desactivado.");
        Boolean valid = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM conversations co
                    JOIN voice_characters vc ON vc.id = co.character_id AND vc.user_id = co.user_id
                    WHERE co.id = ? AND co.user_id = ? AND co.character_id = ?)
                """, Boolean.class, request.conversationId(), request.userId(), request.characterId());
        if (!Boolean.TRUE.equals(valid)) throw notFound("La conversación o el personaje no pertenecen a esta cuenta.");
        Long id = jdbc.queryForObject("""
                INSERT INTO agent_tasks(run_id, user_id, character_id, conversation_id, title, status)
                VALUES (?, ?, ?, ?, ?, 'queued') RETURNING id
                """, Long.class, request.runId(), request.userId(), request.characterId(), request.conversationId(), safeTitle(request.title()));
        return taskById(id);
    }

    @Transactional
    public AgentTaskResponseDto updateTask(long taskId, AgentTaskStatusWriteDto request) {
        if (!List.of("queued", "running", "awaiting_approval", "completed", "failed", "interrupted", "cancelled", "uncertain").contains(request.status()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado de tarea inválido.");
        int changed = jdbc.update("""
                UPDATE agent_tasks SET status = ?, summary = ?, error_code = ?,
                    input_tokens = GREATEST(input_tokens, COALESCE(?, 0)), output_tokens = GREATEST(output_tokens, COALESCE(?, 0)),
                    deepseek_cost_usd = GREATEST(deepseek_cost_usd, COALESCE(?, 0)), fish_cost_usd = GREATEST(fish_cost_usd, COALESCE(?, 0)),
                    updated_at = now(), finished_at = CASE WHEN ? IN ('completed','failed','interrupted','cancelled','uncertain') THEN now() ELSE NULL END
                WHERE id = ? AND status NOT IN ('completed','failed','cancelled','uncertain')
                """, request.status(), safeText(request.summary(), 1000), safeText(request.errorCode(), 80), request.inputTokens(),
                request.outputTokens(), request.deepseekCostUsd(), request.fishCostUsd(), request.status(), taskId);
        if (changed == 0 && !List.of("cancelled", "completed", "failed", "uncertain").contains(taskById(taskId).status()))
            throw notFound("Tarea no encontrada.");
        return taskById(taskId);
    }

    @Transactional
    public AgentStepResponseDto writeStep(long taskId, AgentStepWriteDto request) {
        AgentTaskResponseDto task = taskById(taskId);
        if (List.of("completed", "failed", "cancelled", "uncertain").contains(task.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La tarea ya no admite pasos.");
        jdbc.update("""
                INSERT INTO agent_task_steps(task_id, sequence, tool_name, action_class, target_origin, status, summary, action_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (task_id, sequence) DO UPDATE SET tool_name = EXCLUDED.tool_name,
                    action_class = EXCLUDED.action_class, target_origin = EXCLUDED.target_origin,
                    status = EXCLUDED.status, summary = EXCLUDED.summary,
                    action_hash = COALESCE(EXCLUDED.action_hash, agent_task_steps.action_hash), updated_at = now()
                """, taskId, request.sequence(), request.toolName(), request.actionClass(), safeText(request.targetOrigin(), 512),
                request.status(), safeText(request.summary(), 1000), request.actionHash());
        jdbc.update("UPDATE agent_tasks SET step_count = GREATEST(step_count, ?), updated_at = now() WHERE id = ?", request.sequence(), taskId);
        if ("uncertain".equals(request.status())) jdbc.update("UPDATE agent_tasks SET status = 'uncertain', summary = ?, updated_at = now(), finished_at = now() WHERE id = ?", safeText(request.summary(), 1000), taskId);
        return jdbc.queryForObject("SELECT * FROM agent_task_steps WHERE task_id = ? AND sequence = ?", stepMapper, taskId, request.sequence());
    }

    @Transactional
    public AgentApprovalResponseDto createApproval(long taskId, Integer userId, long stepId, AgentApprovalCreateDto request) {
        AgentTaskResponseDto task = taskById(taskId);
        Integer owner = jdbc.queryForObject("SELECT user_id FROM agent_tasks WHERE id = ?", Integer.class, taskId);
        if (!owner.equals(userId)) throw notFound("Tarea no encontrada.");
        Boolean validStep = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM agent_task_steps WHERE id = ? AND task_id = ? AND action_class <> 'read')",
                Boolean.class, stepId, taskId);
        if (!Boolean.TRUE.equals(validStep)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La autorización no corresponde a una acción de escritura.");
        String payloadJson = json(canonicalValue(request.payload()));
        String hash = sha256(payloadJson);
        int ttl = Math.min(600, Math.max(30, request.expiresInSeconds() == null ? 300 : request.expiresInSeconds()));
        Long id = jdbc.queryForObject("""
                INSERT INTO agent_approvals(task_id, step_id, user_id, character_id, action_label, destination, payload, payload_hash, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, now() + (? * interval '1 second')) RETURNING id
                """, Long.class, taskId, stepId, userId, task.characterId(), request.actionLabel(),
                safeText(request.destination(), 512), payloadJson, hash, ttl);
        jdbc.update("UPDATE agent_task_steps SET status = 'awaiting_approval', action_hash = ?, updated_at = now() WHERE id = ?", hash, stepId);
        jdbc.update("UPDATE agent_tasks SET status = 'awaiting_approval', updated_at = now() WHERE id = ?", taskId);
        return approvalById(userId, id);
    }

    @Transactional
    public AgentApprovalResponseDto getInternalApproval(Integer userId, long taskId, long approvalId) {
        return approvalById(userId, taskId, approvalId);
    }

    @Transactional
    public String consumeApproval(Integer userId, long taskId, long approvalId, String payloadHash) {
        String payload = jdbc.query("""
                UPDATE agent_approvals SET status = 'consumed', consumed_at = now()
                WHERE id = ? AND task_id = ? AND user_id = ? AND status = 'approved' AND expires_at > now() AND payload_hash = ?
                RETURNING payload::text
                """, rs -> rs.next() ? rs.getString(1) : null, approvalId, taskId, userId, payloadHash);
        if (payload == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Autorización inexistente, vencida, modificada o ya consumida.");
        jdbc.update("UPDATE agent_task_steps SET status = 'running', updated_at = now() WHERE id = (SELECT step_id FROM agent_approvals WHERE id = ?)", approvalId);
        return payload;
    }

    @Transactional
    public void markInterrupted() {
        jdbc.update("UPDATE agent_task_steps SET status = 'uncertain', summary = COALESCE(summary, 'La ejecución se interrumpió; verifica esta acción antes de repetirla.'), updated_at = now() WHERE status = 'running' AND task_id IN (SELECT id FROM agent_tasks WHERE status IN ('queued','running','awaiting_approval'))");
        jdbc.update("UPDATE agent_approvals SET status = 'expired' WHERE status IN ('pending','approved') AND task_id IN (SELECT id FROM agent_tasks WHERE status IN ('queued','running','awaiting_approval'))");
        jdbc.update("UPDATE agent_task_steps SET status = 'skipped', summary = 'La tarea se interrumpió antes de ejecutar la acción.', updated_at = now() WHERE status = 'awaiting_approval' AND task_id IN (SELECT id FROM agent_tasks WHERE status IN ('queued','running','awaiting_approval'))");
        jdbc.update("UPDATE agent_tasks SET status = 'interrupted', summary = 'La ejecución se interrumpió y requiere revisión manual.', updated_at = now(), finished_at = now() WHERE status IN ('queued','running','awaiting_approval')");
    }

    @Transactional
    @Scheduled(cron = "0 20 3 * * *")
    public void cleanupTechnicalHistory() {
        jdbc.update("DELETE FROM agent_tasks WHERE created_at < now() - INTERVAL '7 days'");
        jdbc.update("DELETE FROM agent_contact_grants WHERE expires_at <= now() OR revoked_at IS NOT NULL");
        jdbc.update("UPDATE agent_approvals SET status = 'expired' WHERE status = 'pending' AND expires_at <= now()");
    }

    @Transactional
    public Long createContactGrant(Integer userId, AgentContactGrantWriteDto request) {
        requireOwnedCharacter(userId, request.characterId());
        String scope = request.actionScope().trim().toLowerCase();
        if (!List.of("whatsapp_message", "whatsapp_audio").contains(scope))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Alcance de permiso temporal no permitido.");
        return jdbc.queryForObject("""
                INSERT INTO agent_contact_grants(user_id, character_id, contact_key, action_scope, expires_at)
                VALUES (?, ?, ?, ?, now() + (? * interval '1 minute')) RETURNING id
                """, Long.class, userId, request.characterId(), request.contactKey().trim(), scope,
                Math.min(60, request.durationMinutes()));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listContactGrants(Integer userId) {
        return jdbc.queryForList("SELECT id, character_id AS \"characterId\", contact_key AS \"contactKey\", action_scope AS \"actionScope\", expires_at AS \"expiresAt\" FROM agent_contact_grants WHERE user_id = ? AND revoked_at IS NULL AND expires_at > now() ORDER BY expires_at", userId);
    }

    @Transactional
    public void revokeContactGrant(Integer userId, long id) {
        if (jdbc.update("UPDATE agent_contact_grants SET revoked_at = now() WHERE id = ? AND user_id = ? AND revoked_at IS NULL", id, userId) == 0)
            throw notFound("Permiso temporal no encontrado.");
    }

    private AgentTaskResponseDto taskById(long id) {
        var rows = jdbc.query("SELECT t.*, c.character_name AS character_name FROM agent_tasks t JOIN voice_characters c ON c.id = t.character_id WHERE t.id = ?", taskMapper, id);
        if (rows.isEmpty()) throw notFound("Tarea no encontrada.");
        return rows.getFirst();
    }

    private AgentApprovalResponseDto approvalById(Integer userId, long id) {
        return jdbc.queryForObject("""
                SELECT a.id, a.task_id, a.step_id, a.character_id, c.character_name AS character_name, a.action_label,
                       a.destination, a.payload::text AS payload_json, a.payload_hash, a.status, a.expires_at, a.created_at
                FROM agent_approvals a JOIN voice_characters c ON c.id = a.character_id
                WHERE a.id = ? AND a.user_id = ?
                """, approvalMapper, id, userId);
    }

    private AgentApprovalResponseDto approvalById(Integer userId, long taskId, long id) {
        return jdbc.query("""
                SELECT a.id, a.task_id, a.step_id, a.character_id, c.character_name AS character_name, a.action_label,
                       a.destination, a.payload::text AS payload_json, a.payload_hash, a.status, a.expires_at, a.created_at
                FROM agent_approvals a JOIN voice_characters c ON c.id = a.character_id
                WHERE a.id = ? AND a.task_id = ? AND a.user_id = ?
                """, approvalMapper, id, taskId, userId).stream().findFirst()
                .orElseThrow(() -> notFound("Autorización no encontrada."));
    }

    private void requireOwnedCharacter(Integer userId, Integer characterId) {
        Boolean exists = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM voice_characters WHERE id = ? AND user_id = ?)", Boolean.class, characterId, userId);
        if (!Boolean.TRUE.equals(exists)) throw notFound("Personaje no encontrado.");
    }

    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalArgumentException("No se pudo validar el contenido de la autorización."); }
    }

    private Object canonicalValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> sorted = new TreeMap<>();
            map.forEach((key, child) -> sorted.put(String.valueOf(key), canonicalValue(child)));
            return sorted;
        }
        if (value instanceof List<?> list) return list.stream().map(this::canonicalValue).toList();
        return value;
    }

    private String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 no está disponible.", exception); }
    }

    private String safeTitle(String value) { return safeText(value, 200) == null ? "Tarea de automatización" : safeText(value.trim(), 200); }
    private String safeText(String value, int max) { if (value == null) return null; String normalized = value.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").trim(); return normalized.isEmpty() ? null : normalized.substring(0, Math.min(max, normalized.length())); }
    private ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }
}
