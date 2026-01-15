import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthNavigator } from './src/navigation/AuthNavigator';
import { HomeScreen } from './src/screens/home/HomeScreen';
import { useAuthStore } from './src/store/authStore';
import { colors } from './src/theme/colors';

// Loading screen component
const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={colors.accent} />
  </View>
);

// Main app content with auth state handling
const AppContent = () => {
  const { isAuthenticated, isLoading, user, initialize } = useAuthStore();

  // Initialize auth state listener on mount
  useEffect(() => {
    const unsubscribe = initialize();
    return () => unsubscribe();
  }, []);

  // Show loading screen while checking auth state
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Check if user needs email verification (only for email/password sign-in)
  // Social auth providers (Google, Apple) don't require email verification
  const needsEmailVerification = 
    isAuthenticated && 
    user && 
    !user.emailVerified && 
    user.email && 
    // Only require verification for email/password users
    // Google and Apple users are considered verified
    !user.photoURL; // Social users typically have a photoURL

  // Show auth screens if not authenticated or needs email verification
  if (!isAuthenticated || needsEmailVerification) {
    return <AuthNavigator />;
  }

  // Show home screen for authenticated users
  return <HomeScreen />;
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <AppContent />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
});
