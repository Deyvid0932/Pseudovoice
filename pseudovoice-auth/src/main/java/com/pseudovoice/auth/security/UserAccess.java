package com.pseudovoice.auth.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class UserAccess {
    private UserAccess() {}

    public static void requireSameUser(Integer requestedUserId, AuthenticatedUser authenticatedUser) {
        if (authenticatedUser == null || requestedUserId == null || !requestedUserId.equals(authenticatedUser.userId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes acceso a los datos de este usuario.");
        }
    }
}
