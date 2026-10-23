package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;

public record AgentApprovalCreateDto(
        @NotNull Long stepId,
        @NotBlank @Size(max = 120) String actionLabel,
        @Size(max = 512) String destination,
        @NotNull Map<String, Object> payload,
        @Min(30) @Max(600) Integer expiresInSeconds
) {}
