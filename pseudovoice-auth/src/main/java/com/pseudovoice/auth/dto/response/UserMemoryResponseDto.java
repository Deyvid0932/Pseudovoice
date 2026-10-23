package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;

public record UserMemoryResponseDto(Long id, Integer conversationId, Integer characterId,
        String content, String scope, Integer groupId, boolean approved, OffsetDateTime createdAt,
        String origin, boolean sensitive, int revision, OffsetDateTime updatedAt) {}
