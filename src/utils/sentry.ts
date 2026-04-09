import * as Sentry from '@sentry/react-native';

export const sentryNavigationIntegration = Sentry.reactNavigationIntegration();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  environment: __DEV__ ? 'development' : 'production',
  integrations: [sentryNavigationIntegration],
});
