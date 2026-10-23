package com.pseudovoice.auth.service;

import com.pseudovoice.auth.dto.request.CharacterRuleAssignDto;
import com.pseudovoice.auth.dto.response.CharacterRuleResponseDto;
import com.pseudovoice.auth.entity.CharacterRule;
import com.pseudovoice.auth.repository.CharacterRuleRepository;
import com.pseudovoice.auth.repository.RulesCatalogRepository;
import com.pseudovoice.auth.repository.VoiceCharacterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CharacterRuleService {

    private final CharacterRuleRepository characterRuleRepository;
    private final VoiceCharacterRepository characterRepository;
    private final RulesCatalogRepository rulesRepository;

    @Transactional(readOnly = true)
    public List<CharacterRuleResponseDto> getRulesByCharacter(Integer userId, Integer characterId) {
        requireOwnedCharacter(userId, characterId);
        return characterRuleRepository.findByCharacterId(characterId)
                .stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional
    public CharacterRuleResponseDto assignRule(Integer userId, Integer characterId, CharacterRuleAssignDto dto) {
        requireOwnedCharacter(userId, characterId);
        var rule = rulesRepository.findById(dto.ruleId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "La regla no existe."));
        if (rule.getUserId() != null && !rule.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes asignar una regla de otro usuario.");
        }

        characterRuleRepository.findByCharacterIdAndRuleId(characterId, dto.ruleId())
                .ifPresent(cr -> {
                    throw new IllegalArgumentException("Esta regla ya se encuentra asignada al personaje");
                });

        CharacterRule mapping = CharacterRule.builder()
                .characterId(characterId)
                .ruleId(dto.ruleId())
                .priority(dto.priority() != null ? dto.priority() : 1)
                .build();

        return mapToDto(characterRuleRepository.save(mapping));
    }

    @Transactional
    public void unassignRule(Integer userId, Integer characterRuleId) {
        CharacterRule assignment = characterRuleRepository.findById(characterRuleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Asignación no encontrada."));
        requireOwnedCharacter(userId, assignment.getCharacterId());
        characterRuleRepository.delete(assignment);
    }

    private void requireOwnedCharacter(Integer userId, Integer characterId) {
        if (!characterRepository.existsByIdAndUserId(characterId, userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Personaje no encontrado.");
        }
    }

    private CharacterRuleResponseDto mapToDto(CharacterRule cr) {
        return new CharacterRuleResponseDto(
                cr.getId(),
                cr.getCharacterId(),
                cr.getRuleId(),
                cr.getPriority()
        );
    }
}
