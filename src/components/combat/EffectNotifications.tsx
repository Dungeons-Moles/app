/**
 * EffectNotifications - Floating effect indicators during combat
 * Shows item triggers, status effects, and other combat effects
 */

import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Text } from 'react-native';
import type { EffectNotification } from '../../contexts/CombatContext';

interface EffectNotificationsProps {
  notifications: EffectNotification[];
  enemyPosition: { x: number; y: number };
  playerPosition: { x: number; y: number };
}

/**
 * EffectNotifications renders floating effect indicators
 * Shows item/status/trait effects with emoji and text
 */
export const EffectNotifications = memo(function EffectNotifications({
  notifications,
  enemyPosition,
  playerPosition,
}: EffectNotificationsProps) {
  return (
    <View style={styles.container}>
      {notifications.map((notification) => (
        <FloatingNotification
          key={notification.id}
          notification={notification}
          position={notification.target === 'enemy' ? enemyPosition : playerPosition}
        />
      ))}
    </View>
  );
});

interface FloatingNotificationProps {
  notification: EffectNotification;
  position: { x: number; y: number };
}

const FloatingNotification = memo(function FloatingNotification({ notification, position }: FloatingNotificationProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Fade in, float up, then fade out
    Animated.parallel([
      // Scale up and fade in
      Animated.timing(scale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      // Float up animation
      Animated.timing(translateY, {
        toValue: -50,
        duration: 1200,
        useNativeDriver: true,
      }),
      // Fade out after delay
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const getBackgroundColor = () => {
    switch (notification.type) {
      case 'buff':
        return 'rgba(34, 197, 94, 0.9)'; // Green
      case 'debuff':
        return 'rgba(239, 68, 68, 0.9)'; // Red
      case 'status':
        return 'rgba(168, 85, 247, 0.9)'; // Purple
      case 'item':
        return 'rgba(59, 130, 246, 0.9)'; // Blue
      default:
        return 'rgba(100, 100, 100, 0.9)';
    }
  };

  // Offset based on notification id for variety
  const randomOffset = ((notification.id.charCodeAt(0) % 30) - 15);

  return (
    <Animated.View
      style={[
        styles.notificationContainer,
        {
          left: position.x - 50 + randomOffset,
          top: position.y - 10,
          transform: [{ translateY }, { scale }],
          opacity,
          backgroundColor: getBackgroundColor(),
        },
      ]}
    >
      <Text style={styles.emoji}>{notification.emoji}</Text>
      <Text style={styles.text}>{notification.text}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  notificationContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 60,
    maxWidth: 120,
  },
  emoji: {
    fontSize: 12,
    marginRight: 4,
  },
  text: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
    flexShrink: 1,
  },
});
