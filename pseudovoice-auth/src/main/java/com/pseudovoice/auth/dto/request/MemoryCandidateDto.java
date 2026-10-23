package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public record MemoryCandidateDto(
        @NotBlank @Size(max = 1000) String content,
        boolean sensitive,
        @Size(min = 384, max = 384) List<Float> embedding
) {}
