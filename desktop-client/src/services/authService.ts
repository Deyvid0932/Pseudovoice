import { fetchApi } from "./apiClient";
import type { AuthUser } from "../lib/authStorage";

export const authService = {
  signInWithGoogle(idToken: string): Promise<AuthUser> {
    return fetchApi<AuthUser>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
  },
  signInWithGoogleDesktop(authorization: { authorizationCode: string; codeVerifier: string; redirectUri: string }): Promise<AuthUser> {
    return fetchApi<AuthUser>("/auth/google/desktop", {
      method: "POST",
      body: JSON.stringify(authorization),
    });
  },
};
