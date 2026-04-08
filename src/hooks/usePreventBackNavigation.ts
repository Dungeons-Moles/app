import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';

/**
 * Prevents the hardware back button (Android) and swipe-back gesture (iOS)
 * from navigating away from the current screen.
 */
export function usePreventBackNavigation() {
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // Allow programmatic navigation (e.g. navigation.navigate / navigation.replace)
      // but block user-initiated back gestures and hardware back button
      if (e.data.action.type === 'GO_BACK' || e.data.action.type === 'POP') {
        e.preventDefault();
      }
    });

    return unsubscribe;
  }, [navigation]);
}
