package com.pseudovoice.auth.service;

import com.pseudovoice.auth.dto.request.VoiceCharacterCreateDto;
import com.pseudovoice.auth.dto.response.VoiceCharacterResponseDto;
import com.pseudovoice.auth.entity.VoiceCharacter;
import com.pseudovoice.auth.repository.VoiceCharacterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class VoiceCharacterService {

    private final VoiceCharacterRepository characterRepository;
    private final JdbcTemplate jdbc;

    // READ (GET)
    public List<VoiceCharacterResponseDto> getCharactersByUser(Integer userId) {
        return characterRepository.findByUserIdOrderByCreatedAtAscIdAsc(userId)
                .stream()
                .map(this::mapToDto)
                .toList();
    }

    // CREATE (POST)
    @Transactional
    public VoiceCharacterResponseDto createCharacter(Integer userId, VoiceCharacterCreateDto dto) {
        characterRepository.findByUserIdAndCharacterName(userId, dto.characterName())
                .ifPresent(c -> {
                    throw new IllegalArgumentException("Ya existe un personaje con el nombre: " + dto.characterName());
                });

        VoiceCharacter character = VoiceCharacter.builder()
                .userId(userId)
                .characterName(dto.characterName())
                .referenceAudioPath(dto.referenceAudioPath())
                .language(dto.language() != null ? dto.language() : "es")
                .avatarUrl(validateAvatar(dto.avatarUrl()))
                .providerSource(dto.providerSource())
                .providerVoiceId(dto.providerVoiceId())
                .catalogOriginalName(dto.catalogOriginalName())
                .catalogImageUrl(validateCatalogImage(dto.catalogImageUrl()))
                .personalityPrompt(normalizePersonalityPrompt(dto.personalityPrompt()))
                .isActive(true)
                .build();

        return mapToDto(characterRepository.save(character));
    }

    // UPDATE (PUT)
    @Transactional
    public VoiceCharacterResponseDto updateCharacter(Integer userId, Integer characterId, VoiceCharacterCreateDto dto) {
        VoiceCharacter character = characterRepository.findByIdAndUserId(characterId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Personaje no encontrado."));

        character.setCharacterName(dto.characterName());
        character.setReferenceAudioPath(dto.referenceAudioPath());
        if (dto.language() != null) {
            character.setLanguage(dto.language());
        }
        if (dto.avatarUrl() != null) {
            character.setAvatarUrl(validateAvatar(dto.avatarUrl()));
        }
        // Omitted fields from older clients preserve existing personalization.
        if (dto.personalityPrompt() != null) {
            character.setPersonalityPrompt(normalizePersonalityPrompt(dto.personalityPrompt()));
        }
        // Voice source metadata changes only when the voice reference actually changes.
        // Older clients send null catalog fields while editing a character; those nulls
        // must not erase the original Fish name or cover image.
        boolean voiceChanged = !java.util.Objects.equals(dto.referenceAudioPath(), character.getReferenceAudioPath())
                || (dto.providerVoiceId() != null
                && !java.util.Objects.equals(dto.providerVoiceId(), character.getProviderVoiceId()));
        if (dto.providerSource() != null && voiceChanged) {
            character.setProviderSource(dto.providerSource());
            character.setProviderVoiceId(dto.providerVoiceId());
            character.setCatalogOriginalName(dto.catalogOriginalName());
            character.setCatalogImageUrl(validateCatalogImage(dto.catalogImageUrl()));
        }

        return mapToDto(characterRepository.save(character));
    }

    // DELETE (DELETE)
    @Transactional
    public void deleteCharacter(Integer userId, Integer characterId) {
        VoiceCharacter character = characterRepository.findByIdAndUserId(characterId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Personaje no encontrado."));

        // Clean up dependants explicitly as well as relying on database cascades.
        // This also handles existing databases whose FK constraints predate the
        // current ON DELETE CASCADE migrations.
        jdbc.update("DELETE FROM active_session_states WHERE user_id = ? AND active_character_id = ?", userId, characterId);
        jdbc.update("DELETE FROM character_rules WHERE character_id = ?", characterId);
        jdbc.update("DELETE FROM memory_group_members WHERE user_id = ? AND character_id = ?", userId, characterId);
        jdbc.update("DELETE FROM conversation_memories WHERE user_id = ? AND character_id = ?", userId, characterId);
        jdbc.update("UPDATE memory_activity SET character_id = NULL WHERE user_id = ? AND character_id = ?", userId, characterId);
        jdbc.update("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND character_id = ?)", userId, characterId);
        jdbc.update("DELETE FROM conversations WHERE user_id = ? AND character_id = ?", userId, characterId);

        characterRepository.delete(character);
    }

    private VoiceCharacterResponseDto mapToDto(VoiceCharacter character) {
        return new VoiceCharacterResponseDto(
                character.getId(),
                character.getUserId(),
                character.getCharacterName(),
                character.getReferenceAudioPath(),
                character.getLanguage(),
                character.getIsActive(),
                character.getAvatarUrl(), character.getProviderSource(), character.getProviderVoiceId(),
                character.getCatalogOriginalName(), character.getCatalogImageUrl(), character.getPersonalityPrompt()
        );
    }

    private String normalizePersonalityPrompt(String prompt) {
        return prompt == null || prompt.isBlank() ? null : prompt.trim();
    }

    private String validateCatalogImage(String url) {
        if (url == null || url.isBlank()) return null;
        try {
            var uri = java.net.URI.create(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null)
                throw new IllegalArgumentException();
            return url;
        } catch (IllegalArgumentException ex) { throw new IllegalArgumentException("La imagen del catálogo debe usar una URL HTTPS válida."); }
    }

    private String validateAvatar(String avatarUrl) {
        if (avatarUrl == null || avatarUrl.isBlank()) return null;
        if (!avatarUrl.matches("^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$")) {
            throw new IllegalArgumentException("La imagen debe ser un JPEG comprimido en formato de avatar.");
        }
        try {
            byte[] image = java.util.Base64.getDecoder().decode(avatarUrl.substring("data:image/jpeg;base64,".length()));
            if (image.length > 256 * 1024 || image.length < 4 || (image[0] & 0xFF) != 0xFF || (image[1] & 0xFF) != 0xD8
                    || (image[image.length - 2] & 0xFF) != 0xFF || (image[image.length - 1] & 0xFF) != 0xD9) {
                throw new IllegalArgumentException("La imagen supera 256 KB o no es un JPEG válido.");
            }
        } catch (IllegalArgumentException invalidImage) {
            throw new IllegalArgumentException("La imagen JPEG no es válida o está codificada incorrectamente.", invalidImage);
        }
        return avatarUrl;
    }
}
