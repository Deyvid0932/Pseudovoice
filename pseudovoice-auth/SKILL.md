---
name: backend-auth
description: Backend y persistencia en Spring Boot 4.0.8, Java 21, Hibernate ORM 7 y PostgreSQL 18. Mapeo estricto de tipos SERIAL/INT a Integer, y BIGSERIAL a Long.
---

# Habilidad: Backend y Persistencia Segura (Spring Boot 4)

## 1. Stack Tecnológico Exacto
- **Framework Base**: Spring Boot 4.0.8 (Maven, JAR).
- **Runtime**: Java 21 LTS / OpenJDK 26.
- **ORM / Persistencia**: Hibernate ORM 7.2.x (`spring-boot-starter-data-jpa` 4.0.x).
- **Base de Datos**: PostgreSQL 18.x nativo vía JDBC Driver `postgresql:42.7.x`.
- **Seguridad**: Spring Security 7.x (`OAuth2 Client` para Google).
- **Validación & Utilidades**: `hibernate-validator` 9.x y Lombok 1.18.x.

## 2. Reglas Estrictas de Mapeo de Tipos (PostgreSQL <-> Java)
1. **Tipos Enteros de 32 bits (`int4`)**:
   - Toda columna `SERIAL` o `INT` en BD mapea OBLIGATORIAMENTE a `java.lang.Integer` en Java.
   - Aplica a: `users.id`, `voice_characters.id`, `voice_characters.user_id`, `active_session_states.user_id`, `active_session_states.active_character_id`, `rules_catalog.id`, `rules_catalog.user_id`, `character_rules.id`, `character_rules.character_id`, `character_rules.rule_id`, `conversations.id`, `conversations.user_id`, `conversations.character_id`, `messages.conversation_id`.
2. **Tipo Entero de 64 bits (`int8`)**:
   - Solo `BIGSERIAL` o `BIGINT` mapea a `java.lang.Long`.
   - **Exclusivo para**: `messages.id`.
3. **Clave Primaria Directa sin Autoincremento**:
   - `active_session_states` usa `user_id` como `@Id` y `@Column(name = "user_id")` SIN `@GeneratedValue`.

## 3. Arquitectura y Restricciones
- Nunca exponer entidades `@Entity` en `@RestController`; usar DTOs inmutables en paquetes `request` y `response`.
- Validar cada entrada con `@Valid` y manejar errores centralizados con `@RestControllerAdvice`.
