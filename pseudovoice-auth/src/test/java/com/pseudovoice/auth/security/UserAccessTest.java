package com.pseudovoice.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class UserAccessTest {
    @Test
    void allowsOnlyTheAuthenticatedUserId() {
        var user = new AuthenticatedUser(12, "user@example.test", "USER");
        UserAccess.requireSameUser(12, user);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> UserAccess.requireSameUser(13, user));
        assertEquals(HttpStatus.FORBIDDEN, exception.getStatusCode());
    }
}
