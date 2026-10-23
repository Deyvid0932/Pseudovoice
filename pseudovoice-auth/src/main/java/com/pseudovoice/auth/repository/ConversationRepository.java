package com.pseudovoice.auth.repository;

import com.pseudovoice.auth.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ConversationRepository extends JpaRepository<Conversation, Integer> {
    List<Conversation> findByUserIdOrderByStartedAtDesc(Integer userId);
    List<Conversation> findByUserIdAndCharacterIdOrderByStartedAtDesc(Integer userId, Integer characterId);
    Optional<Conversation> findByIdAndUserId(Integer id, Integer userId);
    boolean existsByIdAndUserId(Integer id, Integer userId);
}
