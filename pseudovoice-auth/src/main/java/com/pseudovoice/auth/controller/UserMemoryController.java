package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.UserMemoryWriteDto;
import com.pseudovoice.auth.dto.response.UserMemoryResponseDto;
import com.pseudovoice.auth.dto.request.MemoryPreferencesWriteDto;
import com.pseudovoice.auth.dto.response.MemoryPreferencesResponseDto;
import com.pseudovoice.auth.dto.response.MemoryActivityResponseDto;
import com.pseudovoice.auth.security.AuthenticatedUser;
import com.pseudovoice.auth.service.ConversationMemoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/memory-settings")
@RequiredArgsConstructor
public class UserMemoryController {
    private final ConversationMemoryService service;
    @GetMapping
    public List<UserMemoryResponseDto> list(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(required = false) Integer characterId, @RequestParam(required = false) Boolean approved) {
        return service.list(user.userId(), characterId, approved);
    }
    @GetMapping("/preferences")
    public MemoryPreferencesResponseDto preferences(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.preferences(user.userId());
    }
    @PutMapping("/preferences")
    public MemoryPreferencesResponseDto updatePreferences(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody MemoryPreferencesWriteDto request) {
        return service.updatePreferences(user.userId(), request);
    }
    @GetMapping("/activity")
    public List<MemoryActivityResponseDto> activity(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(defaultValue = "50") int limit) {
        return service.activity(user.userId(), limit);
    }
    @PostMapping("/activity/{id}/undo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void undo(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        service.undo(user.userId(), id);
    }
    @GetMapping("/usage")
    public java.util.Map<String, Object> usage(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.usage(user.userId());
    }
    @GetMapping("/{id}")
    public UserMemoryResponseDto get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) { return service.get(user.userId(), id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public UserMemoryResponseDto create(@AuthenticationPrincipal AuthenticatedUser user, @Valid @RequestBody UserMemoryWriteDto request) { return service.create(user.userId(), request); }
    @PutMapping("/{id}")
    public UserMemoryResponseDto update(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id, @Valid @RequestBody UserMemoryWriteDto request) { return service.update(user.userId(), id, request); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) { service.delete(user.userId(), id); }
}
