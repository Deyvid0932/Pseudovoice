package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.*;
import java.util.List;

public record MemoryGroupWriteDto(
        @NotBlank @Size(max = 100) String name,
        @Size(max = 8000) String personalityInstructions,
        @NotNull @Size(max = 100) List<@NotNull @Positive Integer> characterIds
) {}
