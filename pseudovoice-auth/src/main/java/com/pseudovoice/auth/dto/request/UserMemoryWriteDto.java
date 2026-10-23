package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.*;
import java.util.List;

public record UserMemoryWriteDto(
        @NotNull @Positive Integer characterId,
        @NotBlank @Size(max = 4000) String content,
        @NotNull @Pattern(regexp = "private|group|all") String scope,
        @Positive Integer groupId,
        @NotNull Boolean approved,
        @Size(min = 384, max = 384) List<Float> embedding,
        boolean sensitive
) {
    public UserMemoryWriteDto(Integer characterId, String content, String scope, Integer groupId,
                              Boolean approved, List<Float> embedding) {
        this(characterId, content, scope, groupId, approved, embedding, false);
    }
}
