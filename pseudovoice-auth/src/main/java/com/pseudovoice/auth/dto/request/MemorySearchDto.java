package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record MemorySearchDto(
        @NotNull @Size(min = 384, max = 384) List<Float> embedding,
        @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(10) Integer limit
) {}
