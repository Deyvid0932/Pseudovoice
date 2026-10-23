package com.pseudovoice.auth.service;

import com.pseudovoice.auth.dto.request.RulesCatalogCreateDto;
import com.pseudovoice.auth.dto.request.RulesCatalogUpdateDto;
import com.pseudovoice.auth.dto.response.RulesCatalogResponseDto;
import com.pseudovoice.auth.entity.RulesCatalog;
import com.pseudovoice.auth.repository.RulesCatalogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class RulesCatalogService {

    private final RulesCatalogRepository rulesRepository;

    @Transactional(readOnly = true)
    public List<RulesCatalogResponseDto> getGlobalRules() {
        return rulesRepository.findByUserIdIsNull()
                .stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RulesCatalogResponseDto> getRulesByUser(Integer userId) {
        return rulesRepository.findByUserId(userId)
                .stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional
    public RulesCatalogResponseDto createRule(Integer userId, RulesCatalogCreateDto dto) {
        rulesRepository.findByRuleCode(dto.ruleCode()).ifPresent(r -> {
            throw new IllegalArgumentException("Ya existe una regla con el código: " + dto.ruleCode());
        });

        RulesCatalog rule = RulesCatalog.builder()
                .userId(userId)
                .ruleCode(dto.ruleCode())
                .category(dto.category() != null ? dto.category() : "general")
                .promptDescription(dto.promptDescription())
                .createdByVoice(dto.createdByVoice() != null && dto.createdByVoice())
                .build();

        return mapToDto(rulesRepository.save(rule));
    }

    @Transactional
    public RulesCatalogResponseDto updateRule(Integer userId, Integer ruleId, RulesCatalogUpdateDto dto) {
        RulesCatalog rule = rulesRepository.findById(ruleId)
                .orElseThrow(() -> new RuntimeException("Regla no encontrada con ID: " + ruleId));

        if (rule.getUserId() == null || !rule.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para modificar esta regla.");
        }

        if (dto.category() != null) {
            rule.setCategory(dto.category());
        }
        rule.setPromptDescription(dto.promptDescription());

        return mapToDto(rulesRepository.save(rule));
    }

    @Transactional
    public void deleteRule(Integer userId, Integer ruleId) {
        RulesCatalog rule = rulesRepository.findById(ruleId)
                .orElseThrow(() -> new RuntimeException("Regla no encontrada con ID: " + ruleId));

        if (rule.getUserId() == null || !rule.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para eliminar esta regla.");
        }

        rulesRepository.delete(rule);
    }

    private RulesCatalogResponseDto mapToDto(RulesCatalog rule) {
        return new RulesCatalogResponseDto(
                rule.getId(),
                rule.getUserId(),
                rule.getRuleCode(),
                rule.getCategory(),
                rule.getPromptDescription(),
                rule.getCreatedByVoice()
        );
    }
}
