package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;

public record AgentApprovalResponseDto(long id, long taskId, long stepId, Integer characterId,
        String characterName, String actionLabel, String destination, String payloadJson, String payloadHash,
        String status, OffsetDateTime expiresAt, OffsetDateTime createdAt) {}
