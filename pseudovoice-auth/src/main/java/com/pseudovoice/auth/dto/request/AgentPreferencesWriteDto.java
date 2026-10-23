package com.pseudovoice.auth.dto.request;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.util.List;
import jakarta.validation.constraints.Size;

public record AgentPreferencesWriteDto(
        @NotNull Boolean enabled,
        @NotNull Boolean allowPublicNavigation,
        @NotNull Boolean allowAuthenticatedNavigation,
        @NotNull Boolean allowRead,
        @NotNull Boolean allowFormFill,
        @NotNull Boolean allowDownloads,
        @NotNull Boolean allowUploads,
        @NotNull Boolean allowModifications,
        @NotNull Boolean whatsappEnabled,
        @NotNull @Pattern(regexp = "per_action|temporary_contact") String authorizationMode,
        @NotNull @Min(1) @Max(15) Integer maxSteps,
        @NotNull @DecimalMin("0.00") @DecimalMax("10.00") BigDecimal deepseekBudgetUsd,
        @NotNull @DecimalMin("0.00") @DecimalMax("10.00") BigDecimal fishBudgetUsd,
        Boolean autoApprovePublicNavigation,
        @Size(max = 20) List<@Size(max = 256) String> publicNavigationOrigins
) {}
