package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.GoogleAuthRequestDto;
import com.pseudovoice.auth.dto.request.GoogleDesktopAuthRequestDto;
import com.pseudovoice.auth.dto.response.ApiResponseDto;
import com.pseudovoice.auth.dto.response.AuthResponseDto;
import com.pseudovoice.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/me")
    public com.pseudovoice.auth.dto.response.CurrentUserResponseDto me(
            @org.springframework.security.core.annotation.AuthenticationPrincipal com.pseudovoice.auth.security.AuthenticatedUser user) {
        return new com.pseudovoice.auth.dto.response.CurrentUserResponseDto(user.userId());
    }

    @PostMapping("/google")
    public ResponseEntity<ApiResponseDto<AuthResponseDto>> googleLogin(@Valid @RequestBody GoogleAuthRequestDto request) {
        AuthResponseDto response = authService.loginWithGoogle(request);
        return ResponseEntity.ok(ApiResponseDto.success("Autenticación exitosa", response));
    }

    @PostMapping("/google/desktop")
    public ResponseEntity<ApiResponseDto<AuthResponseDto>> googleDesktopLogin(
            @Valid @RequestBody GoogleDesktopAuthRequestDto request) {
        AuthResponseDto response = authService.loginWithGoogleDesktop(request);
        return ResponseEntity.ok(ApiResponseDto.success("Autenticación exitosa", response));
    }
}
