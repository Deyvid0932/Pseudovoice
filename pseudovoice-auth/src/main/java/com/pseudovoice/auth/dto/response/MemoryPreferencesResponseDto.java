package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;

public record MemoryPreferencesResponseDto(String mode, boolean sharedConsent,
        boolean sensitiveConsent, OffsetDateTime updatedAt) {}
