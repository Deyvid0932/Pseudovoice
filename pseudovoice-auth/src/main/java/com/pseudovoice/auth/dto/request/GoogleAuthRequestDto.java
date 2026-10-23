package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

public record GoogleAuthRequestDto(
        @NotBlank(message = "El id_token de Google es obligatorio")
        String idToken
) {}