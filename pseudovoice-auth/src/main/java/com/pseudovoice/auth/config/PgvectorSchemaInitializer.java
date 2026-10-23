package com.pseudovoice.auth.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Enables native pgvector storage when the server extension is installed. */
@Component
@RequiredArgsConstructor
public class PgvectorSchemaInitializer implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(PgvectorSchemaInitializer.class);
    private final JdbcTemplate jdbc;

    @Override
    public void run(ApplicationArguments args) {
        try {
            Boolean extensionAvailable = jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector')",
                    Boolean.class);
            if (!Boolean.TRUE.equals(extensionAvailable)) {
                log.info("pgvector no está instalado; se conserva el almacenamiento JSONB de respaldo.");
                return;
            }

            jdbc.execute("CREATE EXTENSION IF NOT EXISTS vector");
            Boolean alreadyVector = jdbc.queryForObject("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'conversation_memories'
                          AND column_name = 'embedding'
                          AND udt_name = 'vector'
                    )
                    """, Boolean.class);
            if (!Boolean.TRUE.equals(alreadyVector)) {
                jdbc.execute("""
                        ALTER TABLE conversation_memories
                        ALTER COLUMN embedding TYPE vector(384)
                        USING embedding::text::vector(384)
                        """);
            }
            jdbc.execute("""
                    CREATE INDEX IF NOT EXISTS ix_conversation_memories_embedding_hnsw
                    ON conversation_memories USING hnsw (embedding vector_cosine_ops)
                    """);
            log.info("Memoria conversacional lista con vector(384) e índice HNSW cosine.");
        } catch (DataAccessException exception) {
            log.warn("No se pudo activar pgvector; se mantiene el modo JSONB si la columna aún no migró. Motivo: {}",
                    exception.getMostSpecificCause().getMessage());
        }
    }
}
