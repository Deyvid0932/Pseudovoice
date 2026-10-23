package com.pseudovoice.auth.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class JwtService {
    private static final String ALGORITHM = "HmacSHA256";
    private static final String ISSUER = "pseudovoice-auth";
    private static final Duration TOKEN_LIFETIME = Duration.ofHours(12);
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

    private final ObjectMapper objectMapper;
    private final byte[] secret;

    public JwtService(ObjectMapper objectMapper, @Value("${app.jwt.secret}") String secret) {
        this.objectMapper = objectMapper;
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        if (this.secret.length < 32) {
            throw new IllegalStateException("APP_JWT_SECRET debe tener al menos 32 bytes.");
        }
    }

    public String issue(Integer userId, String email, String role) {
        try {
            Instant now = Instant.now();
            Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
            Map<String, Object> claims = new LinkedHashMap<>();
            claims.put("iss", ISSUER);
            claims.put("sub", userId.toString());
            claims.put("email", email);
            claims.put("role", role);
            claims.put("iat", now.getEpochSecond());
            claims.put("exp", now.plus(TOKEN_LIFETIME).getEpochSecond());
            String unsigned = ENCODER.encodeToString(objectMapper.writeValueAsBytes(header)) + "."
                    + ENCODER.encodeToString(objectMapper.writeValueAsBytes(claims));
            return unsigned + "." + ENCODER.encodeToString(sign(unsigned));
        } catch (Exception exception) {
            throw new IllegalStateException("No se pudo emitir el token de acceso.", exception);
        }
    }

    public AuthenticatedUser verify(String token) {
        try {
            if (token == null || token.length() > 4096) throw new IllegalArgumentException("JWT inválido.");
            String[] parts = token.split("\\.", -1);
            if (parts.length != 3) throw new IllegalArgumentException("JWT inválido.");

            JsonNode header = objectMapper.readTree(DECODER.decode(parts[0]));
            if (!"HS256".equals(header.path("alg").asText())) throw new IllegalArgumentException("Algoritmo JWT no permitido.");

            byte[] suppliedSignature = DECODER.decode(parts[2]);
            if (!MessageDigest.isEqual(sign(parts[0] + "." + parts[1]), suppliedSignature)) {
                throw new IllegalArgumentException("Firma JWT inválida.");
            }

            JsonNode claims = objectMapper.readTree(DECODER.decode(parts[1]));
            if (!ISSUER.equals(claims.path("iss").asText())) throw new IllegalArgumentException("Emisor JWT inválido.");
            long now = Instant.now().getEpochSecond();
            long expiresAt = claims.path("exp").asLong(0);
            long issuedAt = claims.path("iat").asLong(Long.MAX_VALUE);
            if (expiresAt <= now || issuedAt > now + 60) throw new IllegalArgumentException("JWT vencido o emitido en el futuro.");

            int userId = Integer.parseInt(claims.path("sub").asText());
            String email = claims.path("email").asText("");
            String role = claims.path("role").asText("");
            if (userId <= 0 || email.isBlank() || !(role.equals("USER") || role.equals("ADMIN"))) {
                throw new IllegalArgumentException("Identidad JWT incompleta.");
            }
            return new AuthenticatedUser(userId, email, role);
        } catch (Exception exception) {
            if (exception instanceof IllegalArgumentException invalid) throw invalid;
            throw new IllegalArgumentException("JWT inválido.", exception);
        }
    }

    private byte[] sign(String data) throws Exception {
        Mac mac = Mac.getInstance(ALGORITHM);
        mac.init(new SecretKeySpec(secret, ALGORITHM));
        return mac.doFinal(data.getBytes(StandardCharsets.US_ASCII));
    }
}
