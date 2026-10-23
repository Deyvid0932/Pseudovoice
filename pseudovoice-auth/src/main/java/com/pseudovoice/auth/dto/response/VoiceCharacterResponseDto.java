package com.pseudovoice.auth.dto.response;

public record VoiceCharacterResponseDto(
        Integer id,
        Integer userId,
        String characterName,
        String referenceAudioPath,
        String language,
        Boolean isActive,
        String avatarUrl,
        String providerSource,
        String providerVoiceId,
        String catalogOriginalName,
        String catalogImageUrl,
        String personalityPrompt
) {}
