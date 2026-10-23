package com.pseudovoice.auth.security;

public record AuthenticatedUser(Integer userId, String email, String role) {}
