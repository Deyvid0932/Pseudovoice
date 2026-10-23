package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record MemoryCreateDto(
        @NotNull Integer characterId,
        @NotBlank @Size(max = 4000) String content,
        @NotNull @Size(min = 384, max = 384) List<Float> embedding
) {}
