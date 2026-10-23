package com.pseudovoice.auth;

import com.pseudovoice.auth.dto.request.*;
import com.pseudovoice.auth.dto.response.UserMemoryResponseDto;
import com.pseudovoice.auth.service.ConversationMemoryService;
import com.pseudovoice.auth.service.MemoryGroupService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.jdbc.datasource.DataSourceUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Transactional
class MemoryScopesIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired ConversationMemoryService memories;
    @Autowired MemoryGroupService groups;
    @Autowired com.pseudovoice.auth.service.VoiceCharacterService characters;
    @Autowired com.pseudovoice.auth.service.MessageService messages;
    @Autowired jakarta.persistence.EntityManager entityManager;
    Integer owner, other, a, b, c, foreign, ca, cb, cc, cf;
    List<Float> vector;

    @BeforeEach
    void fixtures() {
        owner = user(); other = user();
        a = character(owner); b = character(owner); c = character(owner); foreign = character(other);
        ca = conversation(owner, a); cb = conversation(owner, b); cc = conversation(owner, c); cf = conversation(other, foreign);
        vector = new ArrayList<>(Collections.nCopies(384, 0f)); vector.set(0, 1f);
    }

    Integer user() {
        String id = UUID.randomUUID().toString();
        return jdbc.queryForObject("INSERT INTO users(google_id,email,full_name) VALUES (?,?,'memory test') RETURNING id", Integer.class, id, id + "@test.invalid");
    }
    Integer character(Integer user) {
        return jdbc.queryForObject("INSERT INTO voice_characters(user_id,character_name,reference_audio_path) VALUES (?,?,'test.wav') RETURNING id", Integer.class, user, UUID.randomUUID().toString());
    }
    Integer conversation(Integer user, Integer character) {
        return jdbc.queryForObject("INSERT INTO conversations(user_id,character_id) VALUES (?,?) RETURNING id", Integer.class, user, character);
    }
    UserMemoryResponseDto memory(String content, String scope, Integer group, boolean approved) {
        return memories.create(owner, new UserMemoryWriteDto(a, content, scope, group, approved, vector));
    }
    List<String> search(Integer conversation) {
        return memories.search(conversation, new MemorySearchDto(vector, 10)).stream().map(m -> m.content()).toList();
    }

    @Test
    void recognitionContextExcludesPendingSensitiveAndForeignMemoriesWithoutRequiringEmbeddings() {
        memories.create(owner, new UserMemoryWriteDto(a, "Estudia en UTP", "private", null, true, null));
        memories.create(owner, new UserMemoryWriteDto(a, "PendienteNoCompartir", "private", null, false, null));
        memories.create(other, new UserMemoryWriteDto(foreign, "OtroUsuario", "private", null, true, null));
        jdbc.update("INSERT INTO conversation_memories(user_id,character_id,content,scope,approved,sensitive) VALUES (?,?,?,'private',TRUE,TRUE)",
                owner, a, "DatoSensible");
        var context = memories.context(ca);
        assertThat(context.recognitionMemories()).containsExactly("Estudia en UTP");
        assertThat(context.userName()).isEqualTo("memory test");
        assertThat(context.characterName()).isNotBlank();
        assertThat(memories.context(cb).recognitionMemories()).isEmpty();
        memories.update(owner, memories.list(owner, a, true).stream()
                .filter(m -> m.content().equals("Estudia en UTP")).findFirst().orElseThrow().id(),
                new UserMemoryWriteDto(a, "Programa en Java", "private", null, true, null));
        assertThat(memories.context(ca).recognitionMemories()).containsExactly("Programa en Java");
    }

    @Test
    void transcriptionMetadataRoundTripsThroughJsonbAndTurnRetriesRemainIdempotent() {
        String turnId = UUID.randomUUID().toString();
        var metadata = java.util.Map.<String, Object>of("provider", "groq", "original", "Hola Rem", "speech_ms", 320);
        var request = new MessageCreateDto(ca, "user", "Hola Rem", null, null, turnId,
                null, null, null, null, null, metadata);
        var saved = messages.saveMessage(request);
        entityManager.flush();
        entityManager.clear();
        assertThat(messages.getMessagesByConversation(ca, owner).getFirst().transcriptionMetadata())
                .containsEntry("provider", "groq").containsEntry("original", "Hola Rem");
        assertThat(messages.saveMessage(request).id()).isEqualTo(saved.id());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM messages WHERE turn_id = ?", Integer.class, turnId)).isEqualTo(1);
    }

    @Test
    void approvalAndScopesAreIsolatedAcrossCharactersAndUsers() {
        var group = groups.create(owner, new MemoryGroupWriteDto("group", "friendly", List.of(a, b)));
        memory("private", "private", null, true);
        memory("group", "group", group.id(), true);
        memory("all", "all", null, true);
        memory("pending", "all", null, false);
        assertThat(search(ca)).containsExactlyInAnyOrder("private", "group", "all");
        assertThat(search(cb)).containsExactlyInAnyOrder("group", "all");
        assertThat(search(cc)).containsExactly("all");
        assertThat(search(cf)).isEmpty();
        groups.update(owner, group.id(), new MemoryGroupWriteDto("group", null, List.of(a)));
        assertThat(search(cb)).containsExactly("all");
        groups.update(owner, group.id(), new MemoryGroupWriteDto("group", null, List.of(b)));
        assertThat(search(cb)).containsExactly("all"); // source membership also required
    }

    @Test
    void proposalsAndLegacyDefaultsArePendingPrivateUntilUserApproves() {
        memories.remember(ca, new MemoryCreateDto(a, "proposal", vector));
        var proposal = memories.list(owner, a, false).getFirst();
        assertThat(proposal.scope()).isEqualTo("private");
        assertThat(proposal.conversationId()).isEqualTo(ca);
        assertThat(search(ca)).isEmpty();
        // Same INSERT shape used before V5: migration defaults cannot auto-approve legacy content.
        jdbc.update("INSERT INTO conversation_memories(conversation_id,user_id,character_id,content,embedding) SELECT conversation_id,user_id,character_id,'legacy',embedding FROM conversation_memories WHERE id = ?", proposal.id());
        assertThat(memories.list(owner, a, false)).hasSize(2);
        memories.update(owner, proposal.id(), new UserMemoryWriteDto(a, "proposal", "private", null, true, null));
        assertThat(search(ca)).containsExactly("proposal");
        assertThat(search(cb)).isEmpty();
        memories.update(owner, proposal.id(), new UserMemoryWriteDto(a, "proposal", "all", null, false, null));
        assertThat(search(ca)).isEmpty();
    }

    @Test
    void ownershipChecksProtectCrudGroupsAndScopeAssignment() {
        var memory = memory("owned", "all", null, true);
        var group = groups.create(owner, new MemoryGroupWriteDto("owned", null, List.of(a)));
        assertThatThrownBy(() -> memories.get(other, memory.id())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> memories.update(other, memory.id(), new UserMemoryWriteDto(foreign, "attack", "all", null, true, vector))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> memories.delete(other, memory.id())).isInstanceOf(ResponseStatusException.class);
        assertThat(memories.list(other, null, null)).isEmpty();
        assertThatThrownBy(() -> groups.get(other, group.id())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> groups.update(other, group.id(), new MemoryGroupWriteDto("attack", null, List.of(foreign)))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> groups.delete(other, group.id())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> groups.create(owner, new MemoryGroupWriteDto("attack", null, List.of(foreign)))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> memories.create(other, new UserMemoryWriteDto(foreign, "attack", "group", group.id(), true, vector))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> memories.create(owner, new UserMemoryWriteDto(b, "invalid", "group", group.id(), true, vector))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> memories.create(owner, new UserMemoryWriteDto(a, "invalid", "private", group.id(), true, vector))).isInstanceOf(IllegalArgumentException.class);
        assertThat(memories.get(owner, memory.id()).content()).isEqualTo("owned");
    }

    @Test
    void conversationCharacterConsistencyCannotBeSpoofed() {
        assertThatThrownBy(() -> memories.remember(ca, new MemoryCreateDto(b, "wrong", vector))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> memories.remember(ca, new MemoryCreateDto(foreign, "wrong", vector))).isInstanceOf(IllegalArgumentException.class);
        Integer inconsistent = conversation(other, a);
        assertThatThrownBy(() -> memories.context(inconsistent)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> memories.search(inconsistent, new MemorySearchDto(vector, 5))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> memories.remember(inconsistent, new MemoryCreateDto(a, "wrong", vector))).isInstanceOf(ResponseStatusException.class);
        memories.remember(ca, new MemoryCreateDto(a, "proposal", vector));
        Long id = memories.list(owner, null, null).getFirst().id();
        assertThatThrownBy(() -> memories.update(owner, id, new UserMemoryWriteDto(b, "proposal", "all", null, true, null))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void contextUsesOwnedGroupsAndIndividualInstructionsTakePrecedence() {
        var group = groups.create(owner, new MemoryGroupWriteDto("group", "friendly", List.of(a, b)));
        groups.create(other, new MemoryGroupWriteDto("foreign", "never leak", List.of(foreign)));
        var context = memories.context(ca);
        assertThat(context.userId()).isEqualTo(owner);
        assertThat(context.characterId()).isEqualTo(a);
        assertThat(context.referenceAudioPath()).isEqualTo("test.wav");
        assertThat(context.sharedInstructions()).containsExactly("friendly");
        assertThat(context.effectiveInstructions()).containsExactly("friendly");
        Integer rule = jdbc.queryForObject("INSERT INTO rules_catalog(user_id,rule_code,prompt_description) VALUES (?,?,'individual') RETURNING id", Integer.class, owner, UUID.randomUUID().toString());
        jdbc.update("INSERT INTO character_rules(character_id,rule_id,priority) VALUES (?,?,5)", a, rule);
        assertThat(memories.context(ca).effectiveInstructions()).containsExactly("individual", "friendly");
        assertThat(memories.context(ca).sharedInstructions()).containsExactly("friendly");
        groups.update(owner, group.id(), new MemoryGroupWriteDto("group", "changed", List.of(b)));
        assertThat(memories.context(ca).groups()).isEmpty();
        assertThat(memories.context(cb).effectiveInstructions()).containsExactly("changed");
    }

    @Test
    void deletingGroupPreservesContentPrivatelyAndRevokesApproval() {
        var group = groups.create(owner, new MemoryGroupWriteDto("group", null, List.of(a, b)));
        var memory = memory("preserved", "group", group.id(), true);
        groups.delete(owner, group.id());
        var preserved = memories.get(owner, memory.id());
        assertThat(preserved.content()).isEqualTo("preserved");
        assertThat(preserved.scope()).isEqualTo("private");
        assertThat(preserved.groupId()).isNull();
        assertThat(preserved.approved()).isFalse();
        assertThat(search(ca)).isEmpty();
        assertThat(search(cb)).isEmpty();
    }

    @Test
    void changingContentClearsStaleEmbeddingAndAllowsUserReembedding() {
        var memory = memory("old", "all", null, true);
        memories.update(owner, memory.id(), new UserMemoryWriteDto(a, "new", "all", null, true, null));
        assertThat(search(ca)).isEmpty();
        memories.update(owner, memory.id(), new UserMemoryWriteDto(a, "new", "all", null, true, vector));
        assertThat(search(ca)).containsExactly("new");
        memories.delete(owner, memory.id());
        assertThat(search(ca)).isEmpty();
    }

    @Test
    void rejectsZeroAndNonfiniteEmbeddings() {
        assertThatThrownBy(() -> memories.remember(ca, new MemoryCreateDto(a, "invalid", Collections.nCopies(384, 0f)))).isInstanceOf(IllegalArgumentException.class);
        vector.set(0, Float.NaN);
        assertThatThrownBy(() -> memories.search(ca, new MemorySearchDto(vector, 5))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void migrationRerunPreservesApprovedRowsAndContent() {
        var memory = memory("preserve across restart", "all", null, true);
        var connection = DataSourceUtils.getConnection(jdbc.getDataSource());
        try {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V5__approved_memory_groups.sql"));
            assertThat(memories.get(owner, memory.id())).isEqualTo(memory);
            assertThat(search(cb)).containsExactly("preserve across restart");
        } finally { DataSourceUtils.releaseConnection(connection, jdbc.getDataSource()); }
    }

    @Test
    void characterMetadataPersistsAndUpdatesRespectOwner() {
        var input = new VoiceCharacterCreateDto("catalog test", "owned-fish-reference", "es", null,
                "catalog", "provider-id", "Original catalog name", "https://example.test/image.jpg", "Jeu es calmado y curioso.");
        var character = characters.createCharacter(owner, input);
        assertThat(character.providerVoiceId()).isEqualTo("provider-id");
        assertThat(character.catalogOriginalName()).isEqualTo("Original catalog name");
        assertThat(character.personalityPrompt()).isEqualTo("Jeu es calmado y curioso.");
        assertThatThrownBy(() -> characters.updateCharacter(other, character.id(), input)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> characters.deleteCharacter(other, character.id())).isInstanceOf(ResponseStatusException.class);
        var promptUpdate = characters.updateCharacter(owner, character.id(), new VoiceCharacterCreateDto("catalog test", "owned-fish-reference", "es", null,
                "fish", "provider-id", null, null, "Una personalidad nueva."));
        assertThat(promptUpdate.catalogOriginalName()).isEqualTo("Original catalog name");
        assertThat(promptUpdate.catalogImageUrl()).isEqualTo("https://example.test/image.jpg");
        assertThat(promptUpdate.providerSource()).isEqualTo("catalog");
        var updated = characters.updateCharacter(owner, character.id(), new VoiceCharacterCreateDto("renamed", "owned-fish-reference", "es", null, null, null, null, null, null));
        assertThat(updated.catalogOriginalName()).isEqualTo("Original catalog name");
        assertThat(updated.catalogImageUrl()).isEqualTo("https://example.test/image.jpg");
        assertThat(updated.personalityPrompt()).isEqualTo("Una personalidad nueva.");
        var conversation = conversation(owner, character.id());
        assertThat(memories.context(conversation).referenceAudioPath()).isEqualTo("owned-fish-reference");
        assertThat(memories.context(conversation).personalityPrompt()).isEqualTo("Una personalidad nueva.");
        assertThat(characters.updateCharacter(owner, character.id(), new VoiceCharacterCreateDto("renamed", "owned-fish-reference", "es", null, null, null, null, null, "   ")).personalityPrompt()).isNull();
        characters.deleteCharacter(owner, character.id());
        assertThatThrownBy(() -> characters.deleteCharacter(owner, character.id())).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void deletingCharacterCleansItsSessionHistoryAndMemoryReferences() {
        jdbc.update("INSERT INTO active_session_states(user_id, active_character_id) VALUES (?, ?)", owner, a);
        jdbc.update("INSERT INTO messages(conversation_id, role, content) VALUES (?, 'user', 'hello')", ca);
        var group = groups.create(owner, new MemoryGroupWriteDto("delete with character", null, List.of(a)));
        memory("memory to remove", "private", null, true);

        characters.deleteCharacter(owner, a);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM voice_characters WHERE id = ?", Integer.class, a)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM active_session_states WHERE user_id = ? AND active_character_id = ?", Integer.class, owner, a)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM conversations WHERE id = ?", Integer.class, ca)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM messages WHERE conversation_id = ?", Integer.class, ca)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM conversation_memories WHERE user_id = ? AND character_id = ?", Integer.class, owner, a)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM memory_group_members WHERE group_id = ? AND character_id = ?", Integer.class, group.id(), a)).isZero();
    }
}
