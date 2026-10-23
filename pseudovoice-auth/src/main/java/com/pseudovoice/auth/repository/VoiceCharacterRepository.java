package com.pseudovoice.auth.repository;


import com.pseudovoice.auth.entity.VoiceCharacter;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VoiceCharacterRepository extends JpaRepository<VoiceCharacter, Integer> {

    List<VoiceCharacter> findByUserIdOrderByCreatedAtAscIdAsc(Integer userId);
    Optional<VoiceCharacter> findByIdAndUserId(Integer id, Integer userId);
    boolean existsByIdAndUserId(Integer id, Integer userId);
    List<VoiceCharacter> findByUserIdAndIsActiveTrue(Integer userId);
    Optional<VoiceCharacter> findByUserIdAndCharacterName(Integer userId, String characterName);
}
