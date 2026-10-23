package com.pseudovoice.auth.dto.response;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public record AgentPreferencesResponseDto(
        boolean enabled,
        boolean allowPublicNavigation,
        boolean allowAuthenticatedNavigation,
        boolean allowRead,
        boolean allowFormFill,
        boolean allowDownloads,
        boolean allowUploads,
        boolean allowModifications,
        boolean whatsappEnabled,
        String authorizationMode,
        int maxSteps,
        BigDecimal deepseekBudgetUsd,
        BigDecimal fishBudgetUsd,
        OffsetDateTime updatedAt,
        boolean autoApprovePublicNavigation,
        List<String> publicNavigationOrigins
) {}
