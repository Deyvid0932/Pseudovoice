package com.pseudovoice.auth.repository;

import com.pseudovoice.auth.entity.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findByConversationIdOrderByCreatedAtAsc(Integer conversationId);
    long countByConversationId(Integer conversationId);
    Optional<Message> findByTurnIdAndRole(String turnId, String role);
}
