package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record MemoryPreferencesWriteDto(
        @NotNull @Pattern(regexp = "automatic|suggested|manual") String mode,
        @NotNull Boolean sharedConsent,
        @NotNull Boolean sensitiveConsent
) {}
