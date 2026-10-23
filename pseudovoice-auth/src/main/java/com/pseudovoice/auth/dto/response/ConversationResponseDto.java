package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;

public record ConversationResponseDto(
        Integer id,
        Integer userId,
        Integer characterId,
        String title,
        OffsetDateTime startedAt
) {}