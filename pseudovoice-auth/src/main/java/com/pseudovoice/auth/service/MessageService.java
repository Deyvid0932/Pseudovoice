package com.pseudovoice.auth.service;

import com.pseudovoice.auth.dto.request.MessageCreateDto;
import com.pseudovoice.auth.dto.response.MessageResponseDto;
import com.pseudovoice.auth.entity.Message;
import com.pseudovoice.auth.repository.ConversationRepository;
import com.pseudovoice.auth.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class MessageService {

    private final MessageRepository messageRepository;
    private final ConversationRepository conversationRepository;

    @Transactional(readOnly = true)
    public List<MessageResponseDto> getMessagesByConversation(Integer conversationId, Integer userId) {
        if (!conversationRepository.existsByIdAndUserId(conversationId, userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversación no encontrada.");
        }
        return findMessages(conversationId);
    }

    @Transactional(readOnly = true)
    public List<MessageResponseDto> getMessagesByConversationForInternalService(Integer conversationId) {
        if (!conversationRepository.existsById(conversationId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversación no encontrada.");
        }
        return findMessages(conversationId);
    }

    private List<MessageResponseDto> findMessages(Integer conversationId) {
        return messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)
                .stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional
    public MessageResponseDto saveMessage(MessageCreateDto dto) {
        if (dto.turnId() != null) {
            var existing = messageRepository.findByTurnIdAndRole(dto.turnId(), dto.role());
            if (existing.isPresent()) {
                if (!existing.get().getConversationId().equals(dto.conversationId())) {
                    throw new IllegalArgumentException("El turno ya pertenece a otra conversación");
                }
                return mapToDto(existing.get());
            }
        }
        if (!conversationRepository.existsById(dto.conversationId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "La conversación no existe.");
        }

        Message message = Message.builder()
                .conversationId(dto.conversationId())
                .role(dto.role())
                .content(dto.content())
                .transcriptionMetadata(dto.transcriptionMetadata())
                .generatedAudioPath(dto.generatedAudioPath())
                .ttsLatencyMs(dto.ttsLatencyMs())
                .turnId(dto.turnId())
                .route(dto.route())
                .sttLatencyMs(dto.sttLatencyMs())
                .decisionLatencyMs(dto.decisionLatencyMs())
                .llmLatencyMs(dto.llmLatencyMs())
                .totalTurnLatencyMs(dto.totalTurnLatencyMs())
                .build();

        return mapToDto(messageRepository.save(message));
    }

    private MessageResponseDto mapToDto(Message m) {
        Map<String, Object> telemetry = new LinkedHashMap<>();
        if (m.getSttLatencyMs() != null) telemetry.put("stt_ms", m.getSttLatencyMs());
        if (m.getDecisionLatencyMs() != null) telemetry.put("decision_ms", m.getDecisionLatencyMs());
        if (m.getLlmLatencyMs() != null) telemetry.put("llm_ms", m.getLlmLatencyMs());
        if (m.getTtsLatencyMs() != null) telemetry.put("tts_ms", m.getTtsLatencyMs());
        if (m.getTotalTurnLatencyMs() != null) telemetry.put("total_ms", m.getTotalTurnLatencyMs());
        if (m.getGeneratedAudioPath() != null) telemetry.put("generated_audio_path", m.getGeneratedAudioPath());
        return new MessageResponseDto(
                m.getId(),
                m.getConversationId(),
                m.getRole(),
                m.getContent(),
                m.getGeneratedAudioPath(),
                m.getTtsLatencyMs(),
                m.getCreatedAt(),
                m.getTurnId(),
                m.getRoute(),
                telemetry.isEmpty() ? null : telemetry,
                m.getTranscriptionMetadata()
        );
    }
}
