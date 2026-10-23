package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record AgentTaskStatusWriteDto(
        @NotBlank String status,
        @Size(max = 1000) String summary,
        @Size(max = 80) String errorCode,
        @Min(0) @Max(1000000) Integer inputTokens,
        @Min(0) @Max(1000000) Integer outputTokens,
        @DecimalMin("0") BigDecimal deepseekCostUsd,
        @DecimalMin("0") BigDecimal fishCostUsd
) {}
