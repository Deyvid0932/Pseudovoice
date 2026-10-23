package com.pseudovoice.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "voice_characters", uniqueConstraints = {
        @UniqueConstraint(name = "uq_user_character", columnNames = {"user_id", "character_name"})
})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class VoiceCharacter {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "user_id", nullable = false)
    private Integer userId;

    @Column(name = "character_name", nullable = false, length = 100)
    private String characterName;

    @Column(name = "reference_audio_path", nullable = false)
    private String referenceAudioPath;

    @Column(name = "avatar_url", columnDefinition = "TEXT")
    private String avatarUrl;

    @Column(name = "provider_source", length = 20)
    private String providerSource;

    @Column(name = "provider_voice_id", length = 255)
    private String providerVoiceId;

    @Column(name = "catalog_original_name", length = 255)
    private String catalogOriginalName;

    @Column(name = "catalog_image_url", columnDefinition = "TEXT")
    private String catalogImageUrl;

    @Column(name = "personality_prompt", columnDefinition = "TEXT")
    private String personalityPrompt;

    @Column(length = 10)
    @Builder.Default
    private String language = "es";

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
