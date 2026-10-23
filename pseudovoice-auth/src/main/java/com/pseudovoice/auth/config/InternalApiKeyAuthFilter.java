package com.pseudovoice.auth.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;

@Component
public class InternalApiKeyAuthFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-Internal-Service-Key";
    private final String internalServiceKey;

    public InternalApiKeyAuthFilter(@Value("${internal.service-key}") String internalServiceKey) {
        this.internalServiceKey = internalServiceKey;
        if (internalServiceKey == null || internalServiceKey.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY debe tener al menos 32 bytes.");
        }
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String requestApiKey = request.getHeader(HEADER_NAME);

        if (SecurityContextHolder.getContext().getAuthentication() == null
                && requestApiKey != null
                && MessageDigest.isEqual(
                        requestApiKey.getBytes(StandardCharsets.UTF_8),
                        internalServiceKey.getBytes(StandardCharsets.UTF_8))) {
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    "internal-ai-service",
                    null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_INTERNAL_SERVICE"))
            );
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }
}
