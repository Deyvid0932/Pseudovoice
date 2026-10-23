package com.pseudovoice.auth.service;

import com.pseudovoice.auth.dto.response.ActiveSessionStateResponseDto;
import com.pseudovoice.auth.entity.ActiveSessionState;
import com.pseudovoice.auth.repository.ActiveSessionStateRepository;
import com.pseudovoice.auth.repository.VoiceCharacterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
public class ActiveSessionStateService {

    private final ActiveSessionStateRepository sessionRepository;
    private final VoiceCharacterRepository characterRepository;

    @Transactional(readOnly = true)
    public ActiveSessionStateResponseDto getActiveSession(Integer userId) {
        return sessionRepository.findByUserId(userId)
                .map(this::mapToDto)
                .orElseGet(() -> new ActiveSessionStateResponseDto(userId, null, null));
    }

    @Transactional
    public ActiveSessionStateResponseDto setActiveCharacter(Integer userId, Integer characterId) {
        if (!characterRepository.existsByIdAndUserId(characterId, userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "El personaje no existe para este usuario.");
        }

        ActiveSessionState session = sessionRepository.findByUserId(userId)
                .orElseGet(() -> ActiveSessionState.builder().userId(userId).build());

        session.setActiveCharacterId(characterId);
        session.setUpdatedAt(OffsetDateTime.now());
        return mapToDto(sessionRepository.save(session));
    }

    private ActiveSessionStateResponseDto mapToDto(ActiveSessionState state) {
        return new ActiveSessionStateResponseDto(
                state.getUserId(),
                state.getActiveCharacterId(),
                state.getUpdatedAt()
        );
    }
}
