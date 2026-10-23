package com.pseudovoice.auth.dto.response;

public record AuthResponseDto(
        Integer userId,
        String email,
        String fullName,
        String avatarUrl,
        String accessToken,
        String role
) {}
