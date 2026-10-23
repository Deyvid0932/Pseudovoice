package com.pseudovoice.auth.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class JsonConfig {

    // Jackson 2 sigue siendo utilizado por JwtService. Esta configuración no
    // depende de los filtros que necesitan el mapper durante el arranque.
    @Bean
    public ObjectMapper jackson2ObjectMapper() {
        return new ObjectMapper();
    }
}
