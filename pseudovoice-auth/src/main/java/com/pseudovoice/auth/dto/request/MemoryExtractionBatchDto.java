package com.pseudovoice.auth.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

public record MemoryExtractionBatchDto(
        @NotBlank @Size(max = 120) String batchKey,
        @Min(0) @Max(100000) int inputTokens,
        @Min(0) @Max(100000) int outputTokens,
        @Min(0) BigDecimal estimatedCostUsd,
        @Size(max = 12) List<@Valid MemoryCandidateDto> candidates
) {}
