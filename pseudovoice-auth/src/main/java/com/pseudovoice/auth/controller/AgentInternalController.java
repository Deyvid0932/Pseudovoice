package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.AgentApprovalCreateDto;
import com.pseudovoice.auth.dto.request.AgentStepWriteDto;
import com.pseudovoice.auth.dto.request.AgentTaskCreateInternalDto;
import com.pseudovoice.auth.dto.request.AgentTaskStatusWriteDto;
import com.pseudovoice.auth.dto.response.AgentApprovalResponseDto;
import com.pseudovoice.auth.dto.response.AgentPreferencesResponseDto;
import com.pseudovoice.auth.dto.response.AgentStepResponseDto;
import com.pseudovoice.auth.dto.response.AgentTaskResponseDto;
import com.pseudovoice.auth.service.AgentAutomationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/agent/internal")
@RequiredArgsConstructor
public class AgentInternalController {
    private final AgentAutomationService service;

    @GetMapping("/preferences/{userId}")
    public AgentPreferencesResponseDto preferences(@PathVariable Integer userId) {
        return service.preferences(userId);
    }

    @PostMapping("/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public AgentTaskResponseDto createTask(@Valid @RequestBody AgentTaskCreateInternalDto request) {
        return service.createTask(request);
    }

    @PatchMapping("/tasks/{taskId}")
    public AgentTaskResponseDto updateTask(@PathVariable long taskId, @Valid @RequestBody AgentTaskStatusWriteDto request) {
        return service.updateTask(taskId, request);
    }

    @GetMapping("/tasks/{taskId}")
    public AgentTaskResponseDto getTask(@PathVariable long taskId) {
        return service.getInternalTask(taskId);
    }

    @PutMapping("/tasks/{taskId}/steps")
    public AgentStepResponseDto writeStep(@PathVariable long taskId, @Valid @RequestBody AgentStepWriteDto request) {
        return service.writeStep(taskId, request);
    }

    @PostMapping("/tasks/{taskId}/approvals")
    @ResponseStatus(HttpStatus.CREATED)
    public AgentApprovalResponseDto createApproval(@PathVariable long taskId, @RequestParam Integer userId,
            @Valid @RequestBody AgentApprovalCreateDto request) {
        return service.createApproval(taskId, userId, request.stepId(), request);
    }

    @PostMapping("/tasks/{taskId}/approvals/{approvalId}/consume")
    public Map<String, String> consume(@PathVariable long taskId, @PathVariable long approvalId, @RequestParam Integer userId,
            @RequestParam String payloadHash) {
        return Map.of("payload", service.consumeApproval(userId, taskId, approvalId, payloadHash));
    }

    @GetMapping("/tasks/{taskId}/approvals/{approvalId}")
    public AgentApprovalResponseDto getApproval(@PathVariable long taskId, @PathVariable long approvalId,
            @RequestParam Integer userId) {
        return service.getInternalApproval(userId, taskId, approvalId);
    }

    @PostMapping("/recover")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void recoverAfterRuntimeRestart() {
        service.markInterrupted();
    }
}
