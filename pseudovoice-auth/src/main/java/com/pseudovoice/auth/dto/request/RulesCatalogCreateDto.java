package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RulesCatalogCreateDto(
        @NotBlank(message = "El rule_code es obligatorio")
        @Size(max = 50, message = "El código no debe superar 50 caracteres")
        @Pattern(regexp = "^[A-Z0-9_]+$", message = "El código debe estar en mayúsculas y guiones bajos (ej. BEHAVIOR_SWEET)")
        String ruleCode,

        @Size(max = 50, message = "La categoría no debe superar 50 caracteres")
        String category,

        @NotBlank(message = "La descripción del prompt para el LLM no puede estar vacía")
        String promptDescription,

        Boolean createdByVoice
) {}