package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RulesCatalogUpdateDto(
        @Size(max = 50, message = "La categoría no debe superar 50 caracteres")
        String category,

        @NotBlank(message = "La descripción del prompt no puede estar vacía")
        String promptDescription
) {}