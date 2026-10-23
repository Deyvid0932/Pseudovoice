package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ConversationRenameDto(
        @NotBlank(message = "El título de la conversación no puede estar vacío")
        @Size(max = 150, message = "El título de la conversación no puede superar 150 caracteres")
        String title
) {}
