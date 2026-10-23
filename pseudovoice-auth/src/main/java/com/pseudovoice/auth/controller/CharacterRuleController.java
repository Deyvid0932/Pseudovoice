package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.CharacterRuleAssignDto;
import com.pseudovoice.auth.dto.response.CharacterRuleResponseDto;
import com.pseudovoice.auth.service.CharacterRuleService;
import com.pseudovoice.auth.security.AuthenticatedUser;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/character-rules")
@RequiredArgsConstructor
public class CharacterRuleController {

    private final CharacterRuleService characterRuleService;

    @GetMapping("/character/{characterId}")
    public ResponseEntity<List<CharacterRuleResponseDto>> getRulesByCharacter(@PathVariable Integer characterId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.ok(characterRuleService.getRulesByCharacter(user.userId(), characterId));
    }

    @PostMapping("/character/{characterId}")
    public ResponseEntity<CharacterRuleResponseDto> assignRule(
            @PathVariable Integer characterId,
            @Valid @RequestBody CharacterRuleAssignDto dto,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(characterRuleService.assignRule(user.userId(), characterId, dto));
    }

    @DeleteMapping("/{characterRuleId}")
    public ResponseEntity<Void> unassignRule(@PathVariable Integer characterRuleId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        characterRuleService.unassignRule(user.userId(), characterRuleId);
        return ResponseEntity.noContent().build();
    }
}
