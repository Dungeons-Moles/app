import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ImageBackground,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';

const backgroundImageSource = require('../../assets/ui/backgrounds/hub-background-wide.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const paperPanelSource = require('../../assets/ui/panels/paper-panel.png');

type ProfileSettingsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ProfileSettings'>;
};

const NAME_MAX_LENGTH = 32;

export function ProfileSettingsScreen({ navigation }: ProfileSettingsScreenProps) {
  const { profile, updateName, isLoading, error } = useProfile();
  const [name, setName] = useState(profile?.name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const validateName = useCallback((value: string): string | null => {
    if (!value.trim()) {
      return 'Name is required';
    }
    if (value.length > NAME_MAX_LENGTH) {
      return `Name must be ${NAME_MAX_LENGTH} characters or less`;
    }
    return null;
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      setValidationError(validateName(value));
      setSuccessMessage(null);
    },
    [validateName]
  );

  const handleSave = useCallback(async () => {
    const error = validateName(name);
    if (error) {
      setValidationError(error);
      return;
    }

    // Don't save if name hasn't changed
    if (name === profile?.name) {
      setSuccessMessage('Name unchanged');
      return;
    }

    setIsSaving(true);
    setSuccessMessage(null);

    try {
      const result = await updateName(name);
      if (result.success) {
        setSuccessMessage('Name updated successfully!');
        Alert.alert('Success', 'Your profile name has been updated.');
      } else {
        setValidationError(result.error ?? 'Failed to update name');
      }
    } finally {
      setIsSaving(false);
    }
  }, [name, profile?.name, updateName, validateName]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isButtonDisabled = isSaving || isLoading || !!validationError || name === profile?.name;

  return (
    <View style={styles.container}>
      <Image source={backgroundImageSource} style={styles.backgroundImage} resizeMode="stretch" />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
            <ImageBackground source={buttonV1Source} style={styles.backButton} resizeMode="stretch">
              <Text style={styles.backButtonText}>Back</Text>
            </ImageBackground>
          </TouchableOpacity>

          <Text style={styles.title}>Profile Settings</Text>

          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Name Edit Section */}
          <ImageBackground source={paperPanelSource} style={styles.panel} resizeMode="stretch">
            <Text style={styles.sectionTitle}>Display Name</Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, validationError && styles.inputError]}
                value={name}
                onChangeText={handleNameChange}
                placeholder="Enter your name"
                placeholderTextColor="#888888"
                maxLength={NAME_MAX_LENGTH}
                editable={!isSaving}
              />
              <Text style={styles.charCount}>
                {name.length}/{NAME_MAX_LENGTH}
              </Text>
            </View>

            {validationError && <Text style={styles.errorText}>{validationError}</Text>}
            {successMessage && <Text style={styles.successText}>{successMessage}</Text>}
            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              onPress={handleSave}
              disabled={isButtonDisabled}
              activeOpacity={0.7}
              style={styles.saveButtonWrapper}
            >
              <ImageBackground
                source={buttonV1Source}
                style={[styles.saveButton, isButtonDisabled && styles.saveButtonDisabled]}
                resizeMode="stretch"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#3d2b1f" />
                ) : (
                  <Text
                    style={[
                      styles.saveButtonText,
                      isButtonDisabled && styles.saveButtonTextDisabled,
                    ]}
                  >
                    Save
                  </Text>
                )}
              </ImageBackground>
            </TouchableOpacity>
          </ImageBackground>

          {/* Statistics Section */}
          <ImageBackground source={paperPanelSource} style={styles.panel} resizeMode="stretch">
            <Text style={styles.sectionTitle}>Statistics</Text>

            <View style={styles.statsGrid}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Sessions Played</Text>
                <Text style={styles.statValue}>{profile?.totalRuns ?? 0}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Current Level</Text>
                <Text style={styles.statValue}>{(profile?.currentLevel ?? 0) + 1} / 81</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Available Sessions</Text>
                <Text style={styles.statValue}>{profile?.availableRuns ?? 0}</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Member Since</Text>
                <Text style={styles.statValue}>
                  {profile?.createdAt ? formatDate(profile.createdAt) : 'N/A'}
                </Text>
              </View>
            </View>
          </ImageBackground>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 80,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    marginBottom: 4,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#c8c8c8',
  },
  headerSpacer: {
    width: 80,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
    gap: 16,
  },
  panel: {
    padding: 32,
    minHeight: 200,
  },
  sectionTitle: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#3d2b1f',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#5c4033',
    padding: 12,
    fontSize: 16,
    fontFamily: Typography.body,
    color: '#3d2b1f',
  },
  inputError: {
    borderColor: '#a33a3a',
  },
  charCount: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#5c4033',
    textAlign: 'right',
    marginTop: 4,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#a33a3a',
    marginBottom: 8,
  },
  successText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#228B22',
    marginBottom: 8,
  },
  saveButtonWrapper: {
    alignItems: 'center',
    marginTop: 8,
  },
  saveButton: {
    width: 120,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontFamily: Typography.button,
    fontSize: 18,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  saveButtonTextDisabled: {
    color: '#888888',
  },
  statsGrid: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(92, 64, 51, 0.3)',
  },
  statLabel: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#5c4033',
  },
  statValue: {
    fontFamily: Typography.stat,
    fontSize: 16,
    color: '#3d2b1f',
  },
});
