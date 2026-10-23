package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record VoiceCharacterCreateDto(
        @NotBlank(message = "El nombre del personaje no puede estar vacío")
        @Size(max = 100, message = "El nombre no puede exceder 100 caracteres")
        String characterName,

        @NotBlank(message = "La ruta del audio de referencia es requerida")
        String referenceAudioPath,

        @Size(max = 10, message = "El código de idioma es inválido")
        String language,

        @Size(max = 350_000, message = "La imagen de perfil es demasiado grande")
        String avatarUrl,
        @Size(max = 20) @jakarta.validation.constraints.Pattern(regexp = "local|fish|catalog") String providerSource,
        @Size(max = 255) String providerVoiceId,
        @Size(max = 255) String catalogOriginalName,
        @Size(max = 2048) String catalogImageUrl,
        @Size(max = 20_000, message = "El prompt de personalidad no puede exceder 20.000 caracteres") String personalityPrompt
) {}
