package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.ConversationCreateDto;
import com.pseudovoice.auth.dto.request.ConversationRenameDto;
import com.pseudovoice.auth.dto.response.ConversationResponseDto;
import com.pseudovoice.auth.service.ConversationService;
import com.pseudovoice.auth.security.AuthenticatedUser;
import com.pseudovoice.auth.security.UserAccess;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationService conversationService;

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<ConversationResponseDto>> getByUser(@PathVariable Integer userId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        UserAccess.requireSameUser(userId, user);
        return ResponseEntity.ok(conversationService.getConversationsByUser(userId));
    }

    @PostMapping("/user/{userId}")
    public ResponseEntity<ConversationResponseDto> create(
            @PathVariable Integer userId,
            @Valid @RequestBody ConversationCreateDto dto,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user
    ) {
        UserAccess.requireSameUser(userId, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(conversationService.createConversation(userId, dto));
    }

    @DeleteMapping("/{conversationId}")
    public ResponseEntity<Void> delete(@PathVariable Integer conversationId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        conversationService.deleteConversation(user.userId(), conversationId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{conversationId}")
    public ResponseEntity<ConversationResponseDto> rename(
            @PathVariable Integer conversationId,
            @Valid @RequestBody ConversationRenameDto dto,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.ok(conversationService.renameConversation(user.userId(), conversationId, dto));
    }
}
