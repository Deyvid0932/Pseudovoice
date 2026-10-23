package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CharacterRuleAssignDto(
        @NotNull(message = "El ID de la regla es obligatorio")
        Integer ruleId,

        @Min(value = 1, message = "La prioridad mínima es 1")
        @Max(value = 100, message = "La prioridad máxima es 100")
        Integer priority
) {}