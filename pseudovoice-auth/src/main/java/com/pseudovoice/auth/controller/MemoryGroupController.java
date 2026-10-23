package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.MemoryGroupWriteDto;
import com.pseudovoice.auth.dto.response.MemoryGroupResponseDto;
import com.pseudovoice.auth.security.AuthenticatedUser;
import com.pseudovoice.auth.service.MemoryGroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/memory-groups")
@RequiredArgsConstructor
public class MemoryGroupController {
    private final MemoryGroupService service;
    @GetMapping
    public List<MemoryGroupResponseDto> list(@AuthenticationPrincipal AuthenticatedUser user) { return service.list(user.userId()); }
    @GetMapping("/{id}")
    public MemoryGroupResponseDto get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Integer id) { return service.get(user.userId(), id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public MemoryGroupResponseDto create(@AuthenticationPrincipal AuthenticatedUser user, @Valid @RequestBody MemoryGroupWriteDto request) { return service.create(user.userId(), request); }
    @PutMapping("/{id}")
    public MemoryGroupResponseDto update(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Integer id, @Valid @RequestBody MemoryGroupWriteDto request) { return service.update(user.userId(), id, request); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Integer id) { service.delete(user.userId(), id); }
}
