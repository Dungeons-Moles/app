import * as SecureStore from 'expo-secure-store';
import { PlayerProfile } from '../types';

const PROFILE_KEY = 'player_profile';

export async function saveProfile(profile: PlayerProfile): Promise<void> {
  try {
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error('Failed to save profile:', error);
    throw error;
  }
}

export async function loadProfile(): Promise<PlayerProfile | null> {
  try {
    const data = await SecureStore.getItemAsync(PROFILE_KEY);
    if (data) {
      return JSON.parse(data) as PlayerProfile;
    }
    return null;
  } catch (error) {
    console.error('Failed to load profile:', error);
    return null;
  }
}

export async function deleteProfile(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PROFILE_KEY);
  } catch (error) {
    console.error('Failed to delete profile:', error);
    throw error;
  }
}

export function generateProfileId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
