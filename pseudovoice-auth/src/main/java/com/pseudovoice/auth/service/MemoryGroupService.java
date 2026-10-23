package com.pseudovoice.auth.service;

import com.pseudovoice.auth.dto.request.MemoryGroupWriteDto;
import com.pseudovoice.auth.dto.response.MemoryGroupResponseDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.HashSet;

@Service
@RequiredArgsConstructor
public class MemoryGroupService {
    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public List<MemoryGroupResponseDto> list(Integer userId) {
        return jdbc.queryForList("SELECT id FROM memory_groups WHERE user_id = ? ORDER BY id", Integer.class, userId)
                .stream().map(id -> get(userId, id)).toList();
    }

    @Transactional(readOnly = true)
    public MemoryGroupResponseDto get(Integer userId, Integer id) {
        var groups = jdbc.query("SELECT id, name, personality_instructions FROM memory_groups WHERE id = ? AND user_id = ?",
                (rs, n) -> new MemoryGroupResponseDto(rs.getInt("id"), rs.getString("name"),
                        rs.getString("personality_instructions"), List.of()), id, userId);
        if (groups.isEmpty()) throw notFound();
        var group = groups.getFirst();
        var members = jdbc.queryForList("SELECT character_id FROM memory_group_members WHERE group_id = ? AND user_id = ? ORDER BY character_id",
                Integer.class, id, userId);
        return new MemoryGroupResponseDto(id, group.name(), group.personalityInstructions(), members);
    }

    @Transactional
    public MemoryGroupResponseDto create(Integer userId, MemoryGroupWriteDto request) {
        validateMembers(userId, request.characterIds());
        Integer id = jdbc.queryForObject("INSERT INTO memory_groups(user_id, name, personality_instructions) VALUES (?, ?, ?) RETURNING id",
                Integer.class, userId, request.name().trim(), instructions(request.personalityInstructions()));
        insertMembers(userId, id, request.characterIds());
        return get(userId, id);
    }

    @Transactional
    public MemoryGroupResponseDto update(Integer userId, Integer id, MemoryGroupWriteDto request) {
        lockOwnedGroup(userId, id);
        validateMembers(userId, request.characterIds());
        jdbc.update("UPDATE memory_groups SET name = ?, personality_instructions = ? WHERE id = ? AND user_id = ?",
                request.name().trim(), instructions(request.personalityInstructions()), id, userId);
        jdbc.update("DELETE FROM memory_group_members WHERE group_id = ? AND user_id = ?", id, userId);
        insertMembers(userId, id, request.characterIds());
        return get(userId, id);
    }

    @Transactional
    public void delete(Integer userId, Integer id) {
        lockOwnedGroup(userId, id);
        jdbc.update("UPDATE conversation_memories SET scope = 'private', group_id = NULL, approved = FALSE WHERE group_id = ? AND user_id = ?", id, userId);
        jdbc.update("DELETE FROM memory_groups WHERE id = ? AND user_id = ?", id, userId);
    }

    public void requireOwnedCharacter(Integer userId, Integer characterId) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM voice_characters WHERE id = ? AND user_id = ?)",
                Boolean.class, characterId, userId))) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Personaje no encontrado.");
    }

    public void lockOwnedGroup(Integer userId, Integer id) {
        var ids = jdbc.queryForList("SELECT id FROM memory_groups WHERE id = ? AND user_id = ? FOR UPDATE", Integer.class, id, userId);
        if (ids.isEmpty()) throw notFound();
    }

    private void validateMembers(Integer userId, List<Integer> characters) {
        if (characters == null || characters.size() > 100 || new HashSet<>(characters).size() != characters.size())
            throw new IllegalArgumentException("Lista de miembros inválida o duplicada.");
        for (Integer character : characters) requireOwnedCharacter(userId, character);
    }

    private void insertMembers(Integer userId, Integer id, List<Integer> characters) {
        for (Integer character : characters) jdbc.update("INSERT INTO memory_group_members(group_id, user_id, character_id) VALUES (?, ?, ?)", id, userId, character);
    }

    private String instructions(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Grupo no encontrado."); }
}
