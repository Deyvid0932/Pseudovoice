package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.MessageCreateDto;
import com.pseudovoice.auth.dto.response.MessageResponseDto;
import com.pseudovoice.auth.service.MessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import org.springframework.security.core.Authentication;
import com.pseudovoice.auth.security.AuthenticatedUser;

@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
public class MessageController {

    private final MessageService messageService;

    @GetMapping("/conversation/{conversationId}")
    public ResponseEntity<List<MessageResponseDto>> getByConversation(@PathVariable Integer conversationId,
            Authentication authentication,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        boolean internal = authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_INTERNAL_SERVICE"));
        List<MessageResponseDto> messages = internal
                ? messageService.getMessagesByConversationForInternalService(conversationId)
                : messageService.getMessagesByConversation(conversationId, user.userId());
        return ResponseEntity.ok(messages);
    }

    @PostMapping
    public ResponseEntity<MessageResponseDto> saveMessage(@Valid @RequestBody MessageCreateDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(messageService.saveMessage(dto));
    }
}
