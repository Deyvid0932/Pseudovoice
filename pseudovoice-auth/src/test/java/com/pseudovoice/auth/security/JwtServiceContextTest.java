package com.pseudovoice.auth.security;

import com.pseudovoice.auth.config.JsonConfig;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceContextTest {
    @Test
    void createsJwtFilterWithInjectedJackson2Mapper() {
        new ApplicationContextRunner()
                .withUserConfiguration(JsonConfig.class, JwtService.class, JwtAuthenticationFilter.class)
                .withPropertyValues("app.jwt.secret=test-only-secret-with-more-than-32-bytes-123456")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(JwtAuthenticationFilter.class);
                    JwtService jwtService = context.getBean(JwtService.class);
                    String token = jwtService.issue(73, "jev@example.test", "USER");
                    assertThat(jwtService.verify(token).userId()).isEqualTo(73);
                });
    }
}
