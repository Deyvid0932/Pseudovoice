package com.pseudovoice.auth.dto.response;

import java.util.List;

public record MemoryContextResponseDto(Integer userId, Integer characterId, String referenceAudioPath, String personalityPrompt, List<String> sharedInstructions, List<MemoryGroupResponseDto> groups,
        List<String> individualInstructions, List<String> effectiveInstructions,
        String userName, String characterName, List<String> recognitionMemories,
        List<java.util.Map<String, Object>> characterRules) {}
