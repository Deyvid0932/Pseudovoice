package com.pseudovoice.auth.repository;

import com.pseudovoice.auth.entity.CharacterRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CharacterRuleRepository extends JpaRepository<CharacterRule, Integer> {
    List<CharacterRule> findByCharacterId(Integer characterId);
    Optional<CharacterRule> findByCharacterIdAndRuleId(Integer characterId, Integer ruleId);
}
