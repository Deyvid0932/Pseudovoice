package com.pseudovoice.auth.dto.response;

import java.util.List;

public record MemoryGroupResponseDto(Integer id, String name, String personalityInstructions,
        List<Integer> characterIds) {}
