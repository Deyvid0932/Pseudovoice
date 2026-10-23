package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AgentContactGrantWriteDto(
        @NotNull Integer characterId,
        @NotBlank @Size(max = 256) String contactKey,
        @NotBlank @Size(max = 80) String actionScope,
        @NotNull @Min(1) @Max(60) Integer durationMinutes
) {}
