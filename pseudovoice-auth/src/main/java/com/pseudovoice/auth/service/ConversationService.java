package com.pseudovoice.auth.service;

import com.pseudovoice.auth.dto.request.ConversationCreateDto;
import com.pseudovoice.auth.dto.request.ConversationRenameDto;
import com.pseudovoice.auth.dto.response.ConversationResponseDto;
import com.pseudovoice.auth.entity.Conversation;
import com.pseudovoice.auth.repository.ConversationRepository;
import com.pseudovoice.auth.repository.VoiceCharacterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final VoiceCharacterRepository characterRepository;

    @Transactional(readOnly = true)
    public List<ConversationResponseDto> getConversationsByUser(Integer userId) {
        return conversationRepository.findByUserIdOrderByStartedAtDesc(userId)
                .stream()
                .map(this::mapToDto)
                .toList();
    }

    @Transactional
    public ConversationResponseDto createConversation(Integer userId, ConversationCreateDto dto) {
        if (!characterRepository.existsByIdAndUserId(dto.characterId(), userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "El personaje no existe para este usuario.");
        }

        Conversation conv = Conversation.builder()
                .userId(userId)
                .characterId(dto.characterId())
                .title(dto.title() != null && !dto.title().isBlank() ? dto.title() : "New Conversation")
                .build();

        return mapToDto(conversationRepository.save(conv));
    }

    @Transactional
    public void deleteConversation(Integer userId, Integer conversationId) {
        Conversation conversation = conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversación no encontrada."));
        conversationRepository.delete(conversation);
    }

    @Transactional
    public ConversationResponseDto renameConversation(Integer userId, Integer conversationId, ConversationRenameDto dto) {
        Conversation conversation = conversationRepository.findByIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversación no encontrada."));
        String title = dto.title().trim();
        if (title.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El título de la conversación no puede estar vacío.");
        }
        conversation.setTitle(title);
        return mapToDto(conversationRepository.save(conversation));
    }

    private ConversationResponseDto mapToDto(Conversation conv) {
        return new ConversationResponseDto(
                conv.getId(),
                conv.getUserId(),
                conv.getCharacterId(),
                conv.getTitle(),
                conv.getStartedAt()
        );
    }
}
