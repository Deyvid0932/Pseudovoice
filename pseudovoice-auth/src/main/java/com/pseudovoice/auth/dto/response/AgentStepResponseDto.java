package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;

public record AgentStepResponseDto(long id, int sequence, String toolName, String actionClass,
        String targetOrigin, String status, String summary, OffsetDateTime createdAt, OffsetDateTime updatedAt) {}
