package com.pseudovoice.auth;

import com.pseudovoice.auth.dto.request.ConversationRenameDto;
import com.pseudovoice.auth.entity.Conversation;
import com.pseudovoice.auth.repository.ConversationRepository;
import com.pseudovoice.auth.repository.VoiceCharacterRepository;
import com.pseudovoice.auth.service.ConversationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConversationRenameTest {
    @Mock ConversationRepository conversationRepository;
    @Mock VoiceCharacterRepository characterRepository;
    @InjectMocks ConversationService conversationService;

    @Test
    void trimsTitleAndPersistsForConversationOwner() {
        Conversation conversation = Conversation.builder().id(5).userId(12).characterId(3).title("Antes").build();
        when(conversationRepository.findByIdAndUserId(5, 12)).thenReturn(Optional.of(conversation));
        when(conversationRepository.save(any(Conversation.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var updated = conversationService.renameConversation(12, 5, new ConversationRenameDto("  Nuevo título  "));

        assertEquals("Nuevo título", updated.title());
        verify(conversationRepository).save(conversation);
    }

    @Test
    void refusesToRenameConversationOwnedByAnotherUser() {
        when(conversationRepository.findByIdAndUserId(13, 12)).thenReturn(Optional.empty());

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> conversationService.renameConversation(12, 13, new ConversationRenameDto("Título")));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }
}
