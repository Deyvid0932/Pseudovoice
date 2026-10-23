package com.pseudovoice.auth.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

@Service
public class MemorySensitiveCryptoService {
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    private final SecureRandom random = new SecureRandom();

    @Value("${pseudovoice.memory.encryption-key:}")
    private String encodedKey;

    public boolean isConfigured() {
        return keyOrNull() != null;
    }

    public byte[] encrypt(String content) {
        byte[] key = keyOrNull();
        if (key == null) {
            throw new IllegalStateException("El servidor no tiene configurada MEMORY_ENCRYPTION_KEY; el recuerdo sensible no se guardó.");
        }
        try {
            byte[] nonce = new byte[NONCE_BYTES];
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, nonce));
            byte[] ciphertext = cipher.doFinal(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            byte[] result = Arrays.copyOf(nonce, nonce.length + ciphertext.length);
            System.arraycopy(ciphertext, 0, result, nonce.length, ciphertext.length);
            return result;
        } catch (Exception exception) {
            throw new IllegalStateException("No se pudo cifrar el recuerdo sensible.", exception);
        }
    }

    public String decrypt(byte[] stored) {
        if (stored == null) return null;
        byte[] key = keyOrNull();
        if (key == null) {
            throw new IllegalStateException("El servidor no tiene MEMORY_ENCRYPTION_KEY; el recuerdo sensible permanece protegido y no puede mostrarse.");
        }
        if (stored.length <= NONCE_BYTES) throw new IllegalStateException("El recuerdo sensible cifrado está incompleto.");
        try {
            byte[] nonce = Arrays.copyOfRange(stored, 0, NONCE_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(stored, NONCE_BYTES, stored.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, nonce));
            return new String(cipher.doFinal(ciphertext), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException("No se pudo descifrar el recuerdo sensible; revisa MEMORY_ENCRYPTION_KEY.", exception);
        }
    }

    private byte[] keyOrNull() {
        if (encodedKey == null || encodedKey.isBlank()) return null;
        try {
            byte[] key = Base64.getDecoder().decode(encodedKey.trim());
            return key.length == 32 ? key : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }
}
