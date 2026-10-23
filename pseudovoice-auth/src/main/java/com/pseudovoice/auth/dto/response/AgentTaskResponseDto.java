package com.pseudovoice.auth.dto.response;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record AgentTaskResponseDto(
        long id,
        UUID runId,
        Integer characterId,
        String characterName,
        Integer conversationId,
        String title,
        String status,
        String summary,
        String errorCode,
        int stepCount,
        int inputTokens,
        int outputTokens,
        BigDecimal deepseekCostUsd,
        BigDecimal fishCostUsd,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        OffsetDateTime finishedAt
) {}
