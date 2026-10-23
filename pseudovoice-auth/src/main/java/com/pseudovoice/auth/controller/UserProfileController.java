package com.pseudovoice.auth.controller;

import com.pseudovoice.auth.dto.response.ApiResponseDto;
import com.pseudovoice.auth.dto.response.UserProfileResponseDto;
import com.pseudovoice.auth.service.UserProfileService;
import com.pseudovoice.auth.security.AuthenticatedUser;
import com.pseudovoice.auth.security.UserAccess;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserProfileController {
    private final UserProfileService userProfileService;

    @GetMapping("/{userId}/profile")
    public ApiResponseDto<UserProfileResponseDto> getProfile(@PathVariable Integer userId,
            @org.springframework.security.core.annotation.AuthenticationPrincipal AuthenticatedUser user) {
        UserAccess.requireSameUser(userId, user);
        return ApiResponseDto.success("Perfil obtenido", userProfileService.getProfile(userId));
    }
}
