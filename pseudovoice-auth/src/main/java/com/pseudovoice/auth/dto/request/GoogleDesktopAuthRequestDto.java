package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GoogleDesktopAuthRequestDto(
        @NotBlank @Size(max = 4096) String authorizationCode,
        @NotBlank @Size(min = 43, max = 128) String codeVerifier,
        @NotBlank @Size(max = 256) String redirectUri
) {}
