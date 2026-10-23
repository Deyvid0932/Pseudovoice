package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.AgentContactGrantWriteDto;
import com.pseudovoice.auth.dto.request.AgentPreferencesWriteDto;
import com.pseudovoice.auth.dto.response.AgentApprovalResponseDto;
import com.pseudovoice.auth.dto.response.AgentPreferencesResponseDto;
import com.pseudovoice.auth.dto.response.AgentStepResponseDto;
import com.pseudovoice.auth.dto.response.AgentTaskResponseDto;
import com.pseudovoice.auth.security.AuthenticatedUser;
import com.pseudovoice.auth.service.AgentAutomationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentAutomationController {
    private final AgentAutomationService service;

    @GetMapping("/preferences")
    public AgentPreferencesResponseDto preferences(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.preferences(user.userId());
    }

    @PutMapping("/preferences")
    public AgentPreferencesResponseDto updatePreferences(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody AgentPreferencesWriteDto request) {
        return service.updatePreferences(user.userId(), request);
    }

    @GetMapping("/tasks")
    public List<AgentTaskResponseDto> tasks(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(defaultValue = "50") int limit) {
        return service.listTasks(user.userId(), limit);
    }

    @GetMapping("/tasks/{id}")
    public AgentTaskResponseDto task(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable long id) {
        return service.getTask(user.userId(), id);
    }

    @GetMapping("/tasks/{id}/steps")
    public List<AgentStepResponseDto> steps(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable long id) {
        return service.steps(user.userId(), id);
    }

    @GetMapping("/approvals/pending")
    public List<AgentApprovalResponseDto> pending(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.pendingApprovals(user.userId());
    }

    @PostMapping("/tasks/{taskId}/approvals/{approvalId}/approve")
    public AgentApprovalResponseDto approve(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable long taskId, @PathVariable long approvalId) {
        return service.decideApproval(user.userId(), taskId, approvalId, true);
    }

    @PostMapping("/tasks/{taskId}/approvals/{approvalId}/reject")
    public AgentApprovalResponseDto reject(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable long taskId, @PathVariable long approvalId) {
        return service.decideApproval(user.userId(), taskId, approvalId, false);
    }

    @PostMapping("/tasks/{taskId}/cancel")
    public AgentTaskResponseDto cancel(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable long taskId) {
        return service.cancelTask(user.userId(), taskId);
    }

    @PostMapping("/tasks/{taskId}/interrupt")
    public AgentTaskResponseDto interrupt(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable long taskId) {
        return service.interruptTask(user.userId(), taskId);
    }

    @GetMapping("/contact-grants")
    public List<Map<String, Object>> grants(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.listContactGrants(user.userId());
    }

    @PostMapping("/contact-grants")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Long> createGrant(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody AgentContactGrantWriteDto request) {
        return Map.of("id", service.createContactGrant(user.userId(), request));
    }

    @DeleteMapping("/contact-grants/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeGrant(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable long id) {
        service.revokeContactGrant(user.userId(), id);
    }
}
