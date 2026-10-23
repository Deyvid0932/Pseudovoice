package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.response.ActiveSessionStateResponseDto;
import com.pseudovoice.auth.service.ActiveSessionStateService;
import com.pseudovoice.auth.security.AuthenticatedUser;
import com.pseudovoice.auth.security.UserAccess;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/session-state")
@RequiredArgsConstructor
public class ActiveSessionStateController {

    private final ActiveSessionStateService sessionService;

    @GetMapping("/user/{userId}")
    public ResponseEntity<ActiveSessionStateResponseDto> getActiveSession(@PathVariable Integer userId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        UserAccess.requireSameUser(userId, user);
        return ResponseEntity.ok(sessionService.getActiveSession(userId));
    }

    @PutMapping("/user/{userId}/character/{characterId}")
    public ResponseEntity<ActiveSessionStateResponseDto> switchCharacter(
            @PathVariable Integer userId,
            @PathVariable Integer characterId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user
    ) {
        UserAccess.requireSameUser(userId, user);
        return ResponseEntity.ok(sessionService.setActiveCharacter(userId, characterId));
    }
}
