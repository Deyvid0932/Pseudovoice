package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.VoiceCharacterCreateDto;
import com.pseudovoice.auth.dto.response.ApiResponseDto;
import com.pseudovoice.auth.dto.response.VoiceCharacterResponseDto;
import com.pseudovoice.auth.service.VoiceCharacterService;
import com.pseudovoice.auth.security.AuthenticatedUser;
import com.pseudovoice.auth.security.UserAccess;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/characters")
@RequiredArgsConstructor
public class VoiceCharacterController {

    private final VoiceCharacterService characterService;

    @GetMapping("/user/{userId}")
    public ResponseEntity<ApiResponseDto<List<VoiceCharacterResponseDto>>> getByUser(@PathVariable Integer userId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        UserAccess.requireSameUser(userId, user);
        List<VoiceCharacterResponseDto> characters = characterService.getCharactersByUser(userId);
        return ResponseEntity.ok(ApiResponseDto.success("Personajes obtenidos exitosamente", characters));
    }

    @PostMapping("/user/{userId}")
    public ResponseEntity<ApiResponseDto<VoiceCharacterResponseDto>> create(
            @PathVariable Integer userId,
            @Valid @RequestBody VoiceCharacterCreateDto dto,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user
    ) {
        UserAccess.requireSameUser(userId, user);
        VoiceCharacterResponseDto created = characterService.createCharacter(userId, dto);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseDto.success("Personaje creado exitosamente", created));
    }

    @PutMapping("/{characterId}")
    public ResponseEntity<ApiResponseDto<VoiceCharacterResponseDto>> update(
            @PathVariable Integer characterId,
            @Valid @RequestBody VoiceCharacterCreateDto dto,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user
    ) {
        VoiceCharacterResponseDto updated = characterService.updateCharacter(user.userId(), characterId, dto);
        return ResponseEntity.ok(ApiResponseDto.success("Personaje actualizado exitosamente", updated));
    }

    @DeleteMapping("/{characterId}")
    public ResponseEntity<ApiResponseDto<Void>> delete(@PathVariable Integer characterId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        characterService.deleteCharacter(user.userId(), characterId);
        return ResponseEntity.ok(ApiResponseDto.success("Personaje eliminado exitosamente"));
    }
}
