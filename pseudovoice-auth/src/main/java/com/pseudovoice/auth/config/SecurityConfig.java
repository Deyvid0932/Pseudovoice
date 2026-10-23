package com.pseudovoice.auth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import com.pseudovoice.auth.security.JwtAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final InternalApiKeyAuthFilter internalApiKeyAuthFilter;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(InternalApiKeyAuthFilter internalApiKeyAuthFilter, JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.internalApiKeyAuthFilter = internalApiKeyAuthFilter;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/google").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/google/desktop").permitAll()
                        .requestMatchers("/api/auth/me").hasAnyRole("USER", "ADMIN")
                        .requestMatchers("/api/memory-settings/**", "/api/memory-groups/**").hasRole("USER")
                        .requestMatchers("/api/agent/internal/**").hasRole("INTERNAL_SERVICE")
                        .requestMatchers("/api/agent/**").hasRole("USER")
                        .requestMatchers(HttpMethod.POST, "/api/messages").hasRole("INTERNAL_SERVICE")
                        .requestMatchers("/api/memories/**").hasRole("INTERNAL_SERVICE")
                        .requestMatchers(HttpMethod.GET, "/api/messages/conversation/**").hasAnyRole("USER", "INTERNAL_SERVICE")
                        .requestMatchers("/api/**").hasAnyRole("USER", "ADMIN")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(internalApiKeyAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(jwtAuthenticationFilter, InternalApiKeyAuthFilter.class);

        return http.build();
    }

    @Bean
    public FilterRegistrationBean<InternalApiKeyAuthFilter> disableServletInternalKeyFilter(
            InternalApiKeyAuthFilter filter) {
        FilterRegistrationBean<InternalApiKeyAuthFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> disableServletJwtFilter(JwtAuthenticationFilter filter) {
        FilterRegistrationBean<JwtAuthenticationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.asList(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:1420",
                "tauri://localhost",
                "http://tauri.localhost",
                "http://localhost:8000"
        ));
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(Arrays.asList(
                "Authorization",
                "Content-Type",
                "X-Internal-Service-Key",
                "Accept",
                "Origin",
                "X-Requested-With"
        ));
        config.setExposedHeaders(List.of("X-Internal-Service-Key"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
