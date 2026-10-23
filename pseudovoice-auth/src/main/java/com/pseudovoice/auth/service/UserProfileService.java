package com.pseudovoice.auth.service;

import com.pseudovoice.auth.dto.response.UserProfileResponseDto;
import com.pseudovoice.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserProfileService {
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public UserProfileResponseDto getProfile(Integer userId) {
        return userRepository.findById(userId)
                .map(user -> new UserProfileResponseDto(user.getId(), user.getFullName(), user.getEmail(), user.getAvatarUrl(), user.getCreatedAt()))
                .orElseThrow(() -> new IllegalArgumentException("No existe el usuario con ID: " + userId));
    }
}
