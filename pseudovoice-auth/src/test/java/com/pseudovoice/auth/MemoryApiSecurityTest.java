package com.pseudovoice.auth;

import com.pseudovoice.auth.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "internal.service-key=memory-test-internal-key-at-least-32-bytes",
        "app.jwt.secret=memory-test-jwt-secret-at-least-32-bytes"
})
@AutoConfigureMockMvc
class MemoryApiSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    private static final String KEY = "memory-test-internal-key-at-least-32-bytes";

    String bearer(String role) { return "Bearer " + jwt.issue(123456789, "memory@test.invalid", role); }

    @Test
    void meResolvesSignedBearerAndRejectsInternalAndInvalidTokens() throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization", bearer("USER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.userId").value(123456789));
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer invalid")).andExpect(status().is4xxClientError());
        mvc.perform(get("/api/auth/me").header("X-Internal-Service-Key", KEY)).andExpect(status().isForbidden());
    }

    @Test
    void userMemoryAndGroupRoutesRequireUserAndRejectInternalCredentials() throws Exception {
        for (String path : new String[]{"/api/memory-settings", "/api/memory-groups"}) {
            mvc.perform(get(path)).andExpect(status().is4xxClientError());
            mvc.perform(get(path).header("X-Internal-Service-Key", KEY)).andExpect(status().isForbidden());
            mvc.perform(get(path).header("Authorization", bearer("USER"))).andExpect(status().isOk());
            mvc.perform(get(path).header("Authorization", bearer("ADMIN"))).andExpect(status().isForbidden());
        }
    }

    @Test
    void internalContextAndProposalsRejectUserJwt() throws Exception {
        mvc.perform(get("/api/memories/conversation/123456789/context").header("Authorization", bearer("USER")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/memories/conversation/123456789").header("Authorization", bearer("USER")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/memories/conversation/123456789/context").header("X-Internal-Service-Key", KEY))
                .andExpect(status().isNotFound());
    }

    @Test
    void userWritesValidateScopeAndRequiredFields() throws Exception {
        mvc.perform(post("/api/memory-settings").header("Authorization", bearer("USER"))
                .contentType("application/json").content("{\"characterId\":1,\"content\":\"memory\",\"scope\":\"public\",\"approved\":true}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/memory-groups").header("Authorization", bearer("USER"))
                .contentType("application/json").content("{\"name\":\"test\",\"characterIds\":[null]}"))
                .andExpect(status().isBadRequest());
    }
}
