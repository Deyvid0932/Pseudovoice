package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record AgentTaskCreateInternalDto(
        @NotNull Integer userId,
        @NotNull Integer characterId,
        @NotNull Integer conversationId,
        @NotNull UUID runId,
        @NotBlank @Size(max = 200) String title
) {}
