package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;
import java.util.Map;

public record MessageResponseDto(
        Long id,
        Integer conversationId,
        String role,
        String content,
        String generatedAudioPath,
        Integer ttsLatencyMs,
        OffsetDateTime createdAt,
        String turnId,
        String route,
        Map<String, Object> telemetryMetadata,
        Map<String, Object> transcriptionMetadata
) {}
