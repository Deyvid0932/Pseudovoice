package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.request.MemoryCreateDto;
import com.pseudovoice.auth.dto.request.MemorySearchDto;
import com.pseudovoice.auth.dto.request.MemoryExtractionBatchDto;
import com.pseudovoice.auth.dto.response.MemoryResponseDto;
import com.pseudovoice.auth.dto.response.MemoryExtractionResultDto;
import com.pseudovoice.auth.service.ConversationMemoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/memories/conversation/{conversationId}")
@RequiredArgsConstructor
public class ConversationMemoryController {
    private final ConversationMemoryService memoryService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> remember(@PathVariable Integer conversationId, @Valid @RequestBody MemoryCreateDto request) {
        memoryService.remember(conversationId, request);
        return Map.of("status", "proposed");
    }

    @PostMapping("/search")
    public List<MemoryResponseDto> search(@PathVariable Integer conversationId, @Valid @RequestBody MemorySearchDto request) {
        return memoryService.search(conversationId, request);
    }

    @PostMapping("/extract")
    public MemoryExtractionResultDto extract(@PathVariable Integer conversationId, @Valid @RequestBody MemoryExtractionBatchDto request) {
        return memoryService.extract(conversationId, request);
    }

    @GetMapping("/policy")
    public com.pseudovoice.auth.dto.response.MemoryPreferencesResponseDto policy(@PathVariable Integer conversationId) {
        return memoryService.conversationPolicy(conversationId);
    }

    @GetMapping("/context")
    public com.pseudovoice.auth.dto.response.MemoryContextResponseDto context(@PathVariable Integer conversationId) {
        return memoryService.context(conversationId);
    }
}
