package com.pseudovoice.auth.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pseudovoice.auth.dto.request.GoogleDesktopAuthRequestDto;
import com.pseudovoice.auth.dto.request.GoogleAuthRequestDto;
import com.pseudovoice.auth.dto.response.AuthResponseDto;
import com.pseudovoice.auth.entity.User;
import com.pseudovoice.auth.entity.UserRole;
import com.pseudovoice.auth.repository.UserRepository;
import com.pseudovoice.auth.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

@Service
public class AuthService {

    private static final Logger logger = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;
    private final GoogleIdTokenVerifier verifier;
    private final JwtService jwtService;
    private final ObjectMapper objectMapper;
    private final String desktopClientId;
    private final String desktopClientSecret;
    private final HttpClient httpClient;

    public AuthService(
            UserRepository userRepository,
            JwtService jwtService,
            ObjectMapper objectMapper,
            @Value("${google.client-id}") String clientId,
            @Value("${google.desktop-client-id:}") String desktopClientId,
            @Value("${google.desktop-client-secret:}") String desktopClientSecret) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.objectMapper = objectMapper;
        this.desktopClientId = desktopClientId == null ? "" : desktopClientId.trim();
        this.desktopClientSecret = desktopClientSecret == null ? "" : desktopClientSecret.trim();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(10))
                .build();
        List<String> audiences = new ArrayList<>();
        audiences.add(clientId);
        if (desktopClientId != null && !desktopClientId.isBlank()) {
            audiences.add(desktopClientId.trim());
        }
        this.verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(Collections.unmodifiableList(audiences))
                .build();
    }

    @Transactional
    public AuthResponseDto loginWithGoogleDesktop(GoogleDesktopAuthRequestDto request) {
        if (desktopClientId.isBlank() || desktopClientSecret.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Configura GOOGLE_DESKTOP_CLIENT_ID y GOOGLE_DESKTOP_CLIENT_SECRET para el acceso de escritorio.");
        }

        URI redirectUri;
        try {
            redirectUri = URI.create(request.redirectUri());
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La dirección de retorno de escritorio no es válida.");
        }
        if (!"http".equals(redirectUri.getScheme())
                || !"127.0.0.1".equals(redirectUri.getHost())
                || redirectUri.getPort() < 1
                || !"/".equals(redirectUri.getPath())
                || redirectUri.getQuery() != null
                || redirectUri.getFragment() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La dirección de retorno debe ser un puerto local de escritorio.");
        }

        String form = "client_id=" + encode(desktopClientId)
                + "&client_secret=" + encode(desktopClientSecret)
                + "&code=" + encode(request.authorizationCode())
                + "&code_verifier=" + encode(request.codeVerifier())
                + "&grant_type=authorization_code"
                + "&redirect_uri=" + encode(request.redirectUri());
        HttpRequest tokenRequest = HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/token"))
                .timeout(java.time.Duration.ofSeconds(20))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();
        try {
            HttpResponse<String> response = httpClient.send(tokenRequest, HttpResponse.BodyHandlers.ofString());
            JsonNode payload = objectMapper.readTree(response.body());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String providerError = sanitizeProviderText(payload.path("error").asText("unknown"));
                String providerDescription = sanitizeProviderText(payload.path("error_description").asText(""));
                logger.warn(
                        "Google OAuth desktop token exchange rejected: httpStatus={}, error={}, description={}",
                        response.statusCode(),
                        providerError,
                        providerDescription.isBlank() ? "unavailable" : providerDescription
                );
                String reason = switch (providerError) {
                    case "invalid_client" -> providerDescription.equals("The provided client secret is invalid.")
                            ? "El Client Secret de escritorio es inválido o no corresponde al Client ID configurado."
                            : "Google rechazó las credenciales OAuth de escritorio. Comprueba que el Client ID y el Client Secret pertenezcan al mismo cliente y estén activos.";
                    case "invalid_grant" -> "Google rechazó el código de acceso. Inicia un intento nuevo y comprueba que ambos clientes usan el mismo ID de escritorio.";
                    case "unauthorized_client" -> "El cliente OAuth configurado no tiene permiso para este flujo de escritorio.";
                    default -> "Google rechazó el acceso de escritorio. Comprueba el cliente OAuth y vuelve a intentarlo.";
                };
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, reason);
            }
            if (!payload.hasNonNull("id_token")) {
                logger.warn("Google OAuth desktop token exchange succeeded without an ID token.");
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google no devolvió un ID token para la sesión de escritorio.");
            }
            return loginWithGoogle(new GoogleAuthRequestDto(payload.get("id_token").asText()));
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            logger.warn("Google OAuth desktop token exchange was interrupted.");
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Se interrumpió la comunicación con Google.");
        } catch (Exception exception) {
            logger.error(
                    "Google OAuth desktop token exchange failed: exceptionType={}",
                    exception.getClass().getSimpleName()
            );
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "No se pudo completar el acceso de escritorio con Google.");
        }
    }

    private String sanitizeProviderText(String value) {
        if (value == null) {
            return "";
        }
        String sanitized = value.replaceAll("[\\p{Cntrl}]", " ").trim();
        return sanitized.length() > 240 ? sanitized.substring(0, 240) : sanitized;
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    @Transactional
    public AuthResponseDto loginWithGoogle(GoogleAuthRequestDto request) {
        GoogleIdToken idToken;
        try {
            idToken = verifier.verify(request.idToken());
        } catch (Exception exception) {
            logger.warn(
                    "Google ID token verification failed: exceptionType={}",
                    exception.getClass().getSimpleName()
            );
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No se pudo verificar la identidad con Google.");
        }

        if (idToken == null) {
            logger.warn("Google ID token verification rejected the token.");
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "El token de Google es inválido o expiró.");
        }

        GoogleIdToken.Payload payload = idToken.getPayload();
        if (!Boolean.TRUE.equals(payload.getEmailVerified())
                || payload.getSubject() == null || payload.getEmail() == null || payload.getEmail().isBlank()) {
            logger.warn("Google ID token is missing a verified email or required identity claims.");
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La cuenta de Google no tiene un correo verificado.");
        }

        String googleId = payload.getSubject();
        String email = payload.getEmail();
        String name = (String) payload.get("name");
        String pictureUrl = (String) payload.get("picture");
        final String resolvedName = name == null || name.isBlank() ? email : name;

        User user = userRepository.findByGoogleId(googleId)
                .orElseGet(() -> User.builder()
                        .googleId(googleId)
                        .email(email)
                        .fullName(resolvedName)
                        .avatarUrl(pictureUrl)
                        .role(UserRole.USER)
                        .build());

        user.setEmail(email);
        user.setFullName(resolvedName);
        user.setAvatarUrl(pictureUrl);
        User savedUser = userRepository.save(user);

        return new AuthResponseDto(
                savedUser.getId(),
                savedUser.getEmail(),
                savedUser.getFullName(),
                savedUser.getAvatarUrl(),
                jwtService.issue(savedUser.getId(), savedUser.getEmail(), savedUser.getRole().name()),
                savedUser.getRole().name()
        );
    }
}
