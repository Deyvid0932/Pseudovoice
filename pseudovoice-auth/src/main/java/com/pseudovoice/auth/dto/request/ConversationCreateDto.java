package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ConversationCreateDto(
        @NotNull(message = "El ID del personaje es obligatorio para abrir un hilo")
        Integer characterId,

        @Size(max = 150, message = "El título de la conversación no puede superar 150 caracteres")
        String title
) {}