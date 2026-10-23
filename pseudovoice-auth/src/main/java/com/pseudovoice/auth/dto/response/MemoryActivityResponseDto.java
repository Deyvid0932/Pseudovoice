package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;

public record MemoryActivityResponseDto(Long id, Long memoryId, Integer characterId,
        String action, String source, String contentPreview, boolean undoAvailable,
        int contextItems, int contextTokensEstimate, OffsetDateTime createdAt) {}
