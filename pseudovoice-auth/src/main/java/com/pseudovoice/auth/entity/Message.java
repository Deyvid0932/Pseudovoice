package com.pseudovoice.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "messages")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Message {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id", nullable = false)
    private Integer conversationId;

    @Column(nullable = false, length = 20)
    private String role;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "transcription_metadata", columnDefinition = "jsonb")
    private Map<String, Object> transcriptionMetadata;

    @Column(name = "generated_audio_path")
    private String generatedAudioPath;

    @Column(name = "tts_latency_ms")
    private Integer ttsLatencyMs;

    @Column(name = "turn_id", length = 36)
    private String turnId;

    @Column(name = "route", length = 20)
    private String route;

    @Column(name = "stt_latency_ms")
    private Double sttLatencyMs;

    @Column(name = "decision_latency_ms")
    private Double decisionLatencyMs;

    @Column(name = "llm_latency_ms")
    private Double llmLatencyMs;

    @Column(name = "total_turn_latency_ms")
    private Double totalTurnLatencyMs;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
