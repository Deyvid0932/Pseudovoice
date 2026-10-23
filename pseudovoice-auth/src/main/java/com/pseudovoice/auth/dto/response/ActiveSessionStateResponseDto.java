package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;

public record ActiveSessionStateResponseDto(
        Integer userId,
        Integer activeCharacterId,
        OffsetDateTime updatedAt
) {}