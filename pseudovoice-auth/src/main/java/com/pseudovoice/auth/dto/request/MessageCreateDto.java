package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record MessageCreateDto(
        @NotNull(message = "El ID de conversación es obligatorio")
        Integer conversationId,

        @NotBlank(message = "El rol es obligatorio")
        @Pattern(regexp = "^(user|assistant|system)$", message = "El rol debe ser 'user', 'assistant' o 'system'")
        String role,

        @NotBlank(message = "El contenido del mensaje no puede estar vacío")
        String content,

        @Size(max = 255, message = "La ruta del audio no puede superar 255 caracteres")
        String generatedAudioPath,

        @Min(value = 0, message = "La latencia no puede ser negativa")
        Integer ttsLatencyMs,

        @Size(max = 36)
        String turnId,

        @Size(max = 20)
        String route,

        @DecimalMin("0") Double sttLatencyMs,
        @DecimalMin("0") Double decisionLatencyMs,
        @DecimalMin("0") Double llmLatencyMs,
        @DecimalMin("0") Double totalTurnLatencyMs,
        @Size(max = 15) java.util.Map<String, Object> transcriptionMetadata
) {}
