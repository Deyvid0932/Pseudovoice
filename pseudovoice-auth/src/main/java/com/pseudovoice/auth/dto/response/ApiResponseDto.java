package com.pseudovoice.auth.dto.response;

public record ApiResponseDto<T>(
        String message,
        T data
) {
    public static <T> ApiResponseDto<T> success(String message, T data) {
        return new ApiResponseDto<>(message, data);
    }

    public static <T> ApiResponseDto<T> success(String message) {
        return new ApiResponseDto<>(message, null);
    }
}
