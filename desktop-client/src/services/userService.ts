import { fetchApi } from "./apiClient";

export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string | null;
}

export const userService = {
  getProfile(userId: number): Promise<UserProfile> {
    return fetchApi<UserProfile>(`/users/${userId}/profile`);
  },
};
