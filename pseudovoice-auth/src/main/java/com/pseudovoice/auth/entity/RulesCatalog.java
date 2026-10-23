package com.pseudovoice.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "rules_catalog")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RulesCatalog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "user_id")
    private Integer userId;

    @Column(name = "rule_code", nullable = false, length = 50)
    private String ruleCode;

    @Column(length = 50)
    @Builder.Default
    private String category = "general";

    @Column(name = "prompt_description", nullable = false, columnDefinition = "TEXT")
    private String promptDescription;

    @Column(name = "created_by_voice")
    @Builder.Default
    private Boolean createdByVoice = false;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
