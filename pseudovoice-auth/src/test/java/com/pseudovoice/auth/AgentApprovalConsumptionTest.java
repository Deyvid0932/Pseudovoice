package com.pseudovoice.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pseudovoice.auth.service.AgentAutomationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AgentApprovalConsumptionTest {
    @Mock JdbcTemplate jdbc;
    private AgentAutomationService service;

    @BeforeEach
    void setUp() {
        service = new AgentAutomationService(jdbc, new ObjectMapper());
    }

    @Test
    void approvedPayloadCanOnlyBeConsumedOnceAndMustMatchItsHash() {
        AtomicBoolean consumed = new AtomicBoolean(false);
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            assertTrue(sql.contains("status = 'approved'"));
            assertTrue(sql.contains("payload_hash = ?"));
            return consumed.compareAndSet(false, true) ? "{\"text\":\"approved\"}" : null;
        }).when(jdbc).query(anyString(), org.mockito.ArgumentMatchers.<ResultSetExtractor<String>>any(), any(Object[].class));

        String payload = service.consumeApproval(12, 31L, 9L, "a".repeat(64));

        assertEquals("{\"text\":\"approved\"}", payload);
        ResponseStatusException secondAttempt = assertThrows(ResponseStatusException.class,
                () -> service.consumeApproval(12, 31L, 9L, "a".repeat(64)));
        assertEquals(409, secondAttempt.getStatusCode().value());
        verify(jdbc).update(argThat(sql -> sql.contains("SET status = 'running'")), eq(9L));
    }
}
