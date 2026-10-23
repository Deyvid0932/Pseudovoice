package com.pseudovoice.auth.repository;

import com.pseudovoice.auth.entity.RulesCatalog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RulesCatalogRepository extends JpaRepository<RulesCatalog, Integer> {
    List<RulesCatalog> findByUserIdIsNull();
    List<RulesCatalog> findByUserId(Integer userId);
    Optional<RulesCatalog> findByRuleCode(String ruleCode);
}