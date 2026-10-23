package com.pseudovoice.auth;

import com.pseudovoice.auth.dto.request.MemoryCreateDto;
import com.pseudovoice.auth.dto.request.MemorySearchDto;
import com.pseudovoice.auth.service.ConversationMemoryService;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.UUID;

@SpringBootTest
class PseudovoiceAuthApplicationTests {
	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private ConversationMemoryService memoryService;

	@Test
	void contextLoads() {
	}

	@Test
	@Transactional
	void storesAndRetrievesConversationalMemoryByEmbedding() {
		int[] owner = jdbc.query("""
				SELECT vc.user_id, vc.id AS character_id
				FROM voice_characters vc JOIN users u ON u.id = vc.user_id
				ORDER BY vc.id LIMIT 1
				""", rs -> rs.next() ? new int[]{rs.getInt("user_id"), rs.getInt("character_id")} : null);
		Assumptions.assumeTrue(owner != null, "A user and voice character are required for the DB integration test.");

		Integer conversationId = jdbc.queryForObject("""
				INSERT INTO conversations (user_id, character_id, title)
				VALUES (?, ?, ?) RETURNING id
				""", Integer.class, owner[0], owner[1], "memory-test-" + UUID.randomUUID());
		var embedding = new ArrayList<>(Collections.nCopies(384, 0.0f));
		embedding.set(0, 1.0f);
		String memory = "Jev recuerda la preferencia conversacional " + UUID.randomUUID();

		memoryService.remember(conversationId, new MemoryCreateDto(owner[1], memory, embedding));
		var proposal = memoryService.list(owner[0], owner[1], false).stream()
				.filter(item -> item.content().equals(memory)).findFirst().orElseThrow();
		Assertions.assertTrue(memoryService.search(conversationId, new MemorySearchDto(embedding, 5)).stream()
				.noneMatch(match -> match.content().equals(memory)));
		memoryService.update(owner[0], proposal.id(), new com.pseudovoice.auth.dto.request.UserMemoryWriteDto(
				owner[1], memory, "private", null, true, null));
		var matches = memoryService.search(conversationId, new MemorySearchDto(embedding, 5));

		Assertions.assertTrue(matches.stream().anyMatch(match -> match.content().equals(memory)));
		Assertions.assertTrue(matches.stream().filter(match -> match.content().equals(memory))
				.findFirst().orElseThrow().similarity() > 0.99);
	}

}
