package com.pseudovoice.auth.dto.response;

public record RulesCatalogResponseDto(
        Integer id,
        Integer userId,
        String ruleCode,
        String category,
        String promptDescription,
        Boolean createdByVoice
) {}