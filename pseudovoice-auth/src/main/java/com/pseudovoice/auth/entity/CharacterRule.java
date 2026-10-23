package com.pseudovoice.auth.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "character_rules", uniqueConstraints = {
        @UniqueConstraint(name = "uq_character_rule", columnNames = {"character_id", "rule_id"})
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CharacterRule {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "character_id", nullable = false)
    private Integer characterId;

    @Column(name = "rule_id", nullable = false)
    private Integer ruleId;

    @Builder.Default
    private Integer priority = 1;
}
