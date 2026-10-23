package com.pseudovoice.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtServiceTest {
    private final JwtService jwtService = new JwtService(
            new ObjectMapper(), "test-only-secret-with-more-than-32-bytes-123456");

    @Test
    void issuesAndVerifiesUserIdentity() {
        String token = jwtService.issue(73, "jev@example.test", "USER");

        assertEquals(new AuthenticatedUser(73, "jev@example.test", "USER"), jwtService.verify(token));
    }

    @Test
    void rejectsTamperedToken() {
        String token = jwtService.issue(73, "jev@example.test", "USER");
        String[] parts = token.split("\\.");
        byte[] signature = Base64.getUrlDecoder().decode(parts[2]);
        signature[0] ^= 1;
        String tampered = parts[0] + "." + parts[1] + "."
                + Base64.getUrlEncoder().withoutPadding().encodeToString(signature);

        assertThrows(IllegalArgumentException.class, () -> jwtService.verify(tampered));
    }

    @Test
    void rejectsTokenWithInvalidStructure() {
        assertThrows(IllegalArgumentException.class, () -> jwtService.verify("not-a-jwt"));
    }
}
