package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.RulesCatalogCreateDto;
import com.pseudovoice.auth.dto.request.RulesCatalogUpdateDto;
import com.pseudovoice.auth.dto.response.RulesCatalogResponseDto;
import com.pseudovoice.auth.service.RulesCatalogService;
import com.pseudovoice.auth.security.AuthenticatedUser;
import com.pseudovoice.auth.security.UserAccess;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rules")
@RequiredArgsConstructor
public class RulesCatalogController {

    private final RulesCatalogService rulesService;

    @GetMapping("/global")
    public ResponseEntity<List<RulesCatalogResponseDto>> getGlobalRules() {
        return ResponseEntity.ok(rulesService.getGlobalRules());
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<RulesCatalogResponseDto>> getRulesByUser(@PathVariable Integer userId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        UserAccess.requireSameUser(userId, user);
        return ResponseEntity.ok(rulesService.getRulesByUser(userId));
    }

    @PostMapping("/user/{userId}")
    public ResponseEntity<RulesCatalogResponseDto> createRule(
            @PathVariable Integer userId,
            @Valid @RequestBody RulesCatalogCreateDto dto,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user
    ) {
        UserAccess.requireSameUser(userId, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(rulesService.createRule(userId, dto));
    }

    @PutMapping("/{ruleId}/user/{userId}")
    public ResponseEntity<RulesCatalogResponseDto> updateRule(
            @PathVariable Integer ruleId,
            @PathVariable Integer userId,
            @Valid @RequestBody RulesCatalogUpdateDto dto,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user
    ) {
        UserAccess.requireSameUser(userId, user);
        return ResponseEntity.ok(rulesService.updateRule(userId, ruleId, dto));
    }

    @DeleteMapping("/{ruleId}/user/{userId}")
    public ResponseEntity<Void> deleteRule(
            @PathVariable Integer ruleId,
            @PathVariable Integer userId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user
    ) {
        UserAccess.requireSameUser(userId, user);
        rulesService.deleteRule(userId, ruleId);
        return ResponseEntity.noContent().build();
    }
}
