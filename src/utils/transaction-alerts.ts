import { Alert } from 'react-native';

type RetryPromptOptions = {
  title: string;
  message: string;
  retryLabel?: string;
  cancelLabel?: string;
};

export function promptTransactionRetry({
  title,
  message,
  retryLabel = 'Retry',
  cancelLabel = 'Cancel',
}: RetryPromptOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: retryLabel, onPress: () => resolve(true) },
    ]);
  });
}
