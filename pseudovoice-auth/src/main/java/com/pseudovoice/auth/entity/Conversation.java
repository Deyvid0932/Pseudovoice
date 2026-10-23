package com.pseudovoice.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "conversations")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Conversation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "user_id", nullable = false)
    private Integer userId;

    @Column(name = "character_id", nullable = false)
    private Integer characterId;

    @Column(length = 150)
    @Builder.Default
    private String title = "New Conversation";

    @Column(name = "started_at", insertable = false, updatable = false)
    private OffsetDateTime startedAt;
}
