package com.pseudovoice.auth.dto.response;

import java.time.OffsetDateTime;

public record UserProfileResponseDto(Integer id, String fullName, String email, String avatarUrl, OffsetDateTime createdAt) {}
