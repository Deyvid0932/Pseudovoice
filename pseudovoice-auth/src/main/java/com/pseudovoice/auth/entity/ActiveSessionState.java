package com.pseudovoice.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "active_session_states")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ActiveSessionState {
    @Id
    @Column(name = "user_id")
    private Integer userId;

    @Column(name = "active_character_id", nullable = false)
    private Integer activeCharacterId;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
