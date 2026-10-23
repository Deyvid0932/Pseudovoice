package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AgentStepWriteDto(
        @NotNull @Min(1) Integer sequence,
        @NotBlank @Size(max = 80) String toolName,
        @NotBlank @Pattern(regexp = "read|write|external_send") String actionClass,
        @Size(max = 512) String targetOrigin,
        @NotBlank @Pattern(regexp = "planned|awaiting_approval|running|succeeded|failed|uncertain|skipped") String status,
        @Size(max = 1000) String summary,
        @Pattern(regexp = "[a-fA-F0-9]{64}") String actionHash
) {}
