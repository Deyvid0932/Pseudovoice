package com.pseudovoice.auth.dto.response;

public record CharacterRuleResponseDto(
        Integer id,
        Integer characterId,
        Integer ruleId,
        Integer priority
) {}