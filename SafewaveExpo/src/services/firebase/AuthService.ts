import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { Platform } from 'react-native';
import { User, SignUpData, SignInData, AuthError } from '../../types/user';
import { FirestoreService } from './FirestoreService';
import { AppPresenceService } from '../AppPresenceService';

const PASSWORD_PROVIDER_ID = 'password';
const GOOGLE_PROVIDER_ID = 'google.com';
const APPLE_PROVIDER_ID = 'apple.com';

// Track if Google Sign-In is available (requires development build, not available in Expo Go)
let isGoogleSignInAvailable = false;

// Configure Google Sign-In
// The webClientId comes from google-services.json (client_type: 3)
try {
  console.log('[AuthService] Configuring Google Sign-In...');
  GoogleSignin.configure({
    webClientId: '393568702648-35j8je711c8eh5t2n0pokqa1ce3uc2bj.apps.googleusercontent.com',
  });
  isGoogleSignInAvailable = true;
  console.log('[AuthService] Google Sign-In configured successfully');
} catch (error: any) {
  console.log('[AuthService] Google Sign-In configure FAILED:', error?.message || error);
  console.log('[AuthService] Configure error code:', error?.code);
  console.log('[AuthService] Full configure error:', JSON.stringify(error, null, 2));
}

/**
 * Convert Firebase user to our User type
 */
const mapFirebaseUser = (firebaseUser: FirebaseAuthTypes.User): User => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
  emailVerified: firebaseUser.emailVerified,
  primaryProviderId: getPrimaryProviderId(firebaseUser),
});

const getGoogleIdToken = (signInResult: any): string | undefined =>
  signInResult?.data?.idToken || signInResult?.idToken;

const getPrimaryProviderId = (firebaseUser: FirebaseAuthTypes.User): string => {
  const linkedProviderId = firebaseUser.providerData
    .map((provider) => provider.providerId)
    .find((providerId) => providerId && providerId !== 'firebase');

  if (linkedProviderId) {
    return linkedProviderId;
  }

  return firebaseUser.email ? PASSWORD_PROVIDER_ID : 'unknown';
};

const getRequiredUser = (): FirebaseAuthTypes.User => {
  const user = auth().currentUser;

  if (!user) {
    throw { code: 'auth/no-user', message: 'No user is currently signed in' };
  }

  return user;
};

const reauthenticateWithPassword = async (
  user: FirebaseAuthTypes.User,
  password?: string
): Promise<void> => {
  if (!user.email) {
    throw { code: 'auth/no-user', message: 'No user is currently signed in' };
  }

  if (!password) {
    throw {
      code: 'auth/missing-password',
      message: 'Please enter your password to delete your account.',
    };
  }

  const credential = auth.EmailAuthProvider.credential(user.email, password);
  await user.reauthenticateWithCredential(credential);
};

const reauthenticateWithGoogle = async (user: FirebaseAuthTypes.User): Promise<void> => {
  if (!isGoogleSignInAvailable) {
    throw {
      code: 'google-signin/not-available',
      message: 'Google Sign-In requires a development build. It is not available in Expo Go.',
    };
  }

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const signInResult = await GoogleSignin.signIn();
  const idToken = getGoogleIdToken(signInResult);

  if (!idToken) {
    throw { code: 'google-signin/no-token', message: 'Failed to get Google ID token' };
  }

  const googleCredential = auth.GoogleAuthProvider.credential(idToken);
  await user.reauthenticateWithCredential(googleCredential);
};

const reauthenticateWithApple = async (user: FirebaseAuthTypes.User): Promise<void> => {
  if (Platform.OS !== 'ios') {
    throw {
      code: 'apple-signin/not-supported',
      message: 'Apple Sign-In account deletion is only available on iOS.',
    };
  }

  const appleAuthRequestResponse = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
  });
  const { identityToken, nonce, authorizationCode } = appleAuthRequestResponse as {
    identityToken?: string | null;
    nonce?: string | null;
    authorizationCode?: string | null;
  };

  if (!identityToken) {
    throw { code: 'apple-signin/no-token', message: 'Failed to get Apple identity token' };
  }

  const appleCredential = auth.AppleAuthProvider.credential(identityToken, nonce || undefined);
  await user.reauthenticateWithCredential(appleCredential);

  if (authorizationCode) {
    await auth().revokeToken(authorizationCode);
  }
};

/**
 * Parse Firebase auth errors to user-friendly messages
 */
const parseAuthError = (error: any): AuthError => {
  const code = error.code || 'unknown';
  let message = error.message || 'An unknown error occurred';

  switch (code) {
    case 'auth/email-already-in-use':
      message = 'This email is already registered. Please sign in instead.';
      break;
    case 'auth/invalid-email':
      message = 'Please enter a valid email address.';
      break;
    case 'auth/operation-not-allowed':
      message = 'This sign-in method is not enabled.';
      break;
    case 'auth/weak-password':
      message = 'Password should be at least 6 characters.';
      break;
    case 'auth/user-disabled':
      message = 'This account has been disabled.';
      break;
    case 'auth/user-not-found':
      message = 'No account found with this email.';
      break;
    case 'auth/wrong-password':
      message = 'Incorrect password. Please try again.';
      break;
    case 'auth/invalid-credential':
      message = 'Invalid email or password.';
      break;
    case 'auth/too-many-requests':
      message = 'Too many failed attempts. Please try again later.';
      break;
    case 'auth/network-request-failed':
      message = 'Network error. Please check your connection.';
      break;
    case 'auth/requires-recent-login':
      message = 'Please re-authenticate and try deleting your account again.';
      break;
    case 'auth/missing-password':
      message = 'Please enter your password to delete your account.';
      break;
    case 'auth/unsupported-provider':
      message = 'This sign-in method is not yet supported for account deletion.';
      break;
  }

  return { code, message };
};

export const AuthService = {
  /**
   * Check if Google Sign-In is available
   * (requires development build, not available in Expo Go)
   */
  isGoogleSignInAvailable: (): boolean => isGoogleSignInAvailable,

  /**
   * Get the current authenticated user
   */
  getCurrentUser: (): User | null => {
    const firebaseUser = auth().currentUser;
    return firebaseUser ? mapFirebaseUser(firebaseUser) : null;
  },

  /**
   * Get the primary auth provider for the current user
   */
  getCurrentProviderId: (): string | null => {
    const firebaseUser = auth().currentUser;
    return firebaseUser ? getPrimaryProviderId(firebaseUser) : null;
  },

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChanged: (callback: (user: User | null) => void): (() => void) => {
    return auth().onAuthStateChanged((firebaseUser) => {
      callback(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
    });
  },

  /**
   * Sign in with email and password
   */
  signInWithEmail: async (data: SignInData): Promise<User> => {
    try {
      const { email, password } = data;
      const credential = await auth().signInWithEmailAndPassword(email, password);
      return mapFirebaseUser(credential.user);
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Sign up with email and password
   */
  signUpWithEmail: async (data: SignUpData): Promise<User> => {
    try {
      const { email, password, displayName } = data;

      // Create the auth user
      const credential = await auth().createUserWithEmailAndPassword(email, password);

      // Update display name
      await credential.user.updateProfile({ displayName });

      // Create Firestore user document
      await FirestoreService.createUser(credential.user.uid, {
        displayName,
        email,
        organizationId: '',
        role: 'user',
        bands: [],
      });

      // Send email verification
      await credential.user.sendEmailVerification();

      return mapFirebaseUser(credential.user);
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Sign in with Google
   */
  signInWithGoogle: async (): Promise<User> => {
    console.log('[AuthService] signInWithGoogle called');
    console.log('[AuthService] isGoogleSignInAvailable:', isGoogleSignInAvailable);

    // Check if Google Sign-In is available (requires development build)
    if (!isGoogleSignInAvailable) {
      throw {
        code: 'google-signin/not-available',
        message: 'Google Sign-In requires a development build. It is not available in Expo Go.'
      };
    }

    try {
      // Step 1: Check Play Services
      console.log('[AuthService] Step 1: Checking Play Services...');
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      console.log('[AuthService] Step 1: Play Services OK');

      // Step 2: Google Sign-In
      console.log('[AuthService] Step 2: Calling GoogleSignin.signIn()...');
      const signInResult = await GoogleSignin.signIn();
      console.log('[AuthService] Step 2: signIn result type:', signInResult?.type);
      console.log('[AuthService] Step 2: signIn result data keys:', signInResult?.data ? Object.keys(signInResult.data) : 'no data');
      console.log('[AuthService] Step 2: signIn result user email:', signInResult?.data?.user?.email);
      console.log('[AuthService] Step 2: idToken present:', !!signInResult?.data?.idToken);
      console.log('[AuthService] Step 2: idToken length:', signInResult?.data?.idToken?.length || 0);

      const idToken = getGoogleIdToken(signInResult);

      if (!idToken) {
        console.log('[AuthService] Step 2: FAILED - No ID token received');
        console.log('[AuthService] Full signInResult:', JSON.stringify(signInResult, null, 2));
        throw { code: 'google-signin/no-token', message: 'Failed to get Google ID token' };
      }

      // Step 3: Create Firebase credential
      console.log('[AuthService] Step 3: Creating Google credential for Firebase...');
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      console.log('[AuthService] Step 3: Google credential created');

      // Step 4: Sign in to Firebase
      console.log('[AuthService] Step 4: Signing in to Firebase with Google credential...');
      const credential = await auth().signInWithCredential(googleCredential);
      console.log('[AuthService] Step 4: Firebase sign-in successful, uid:', credential.user.uid);
      console.log('[AuthService] Step 4: isNewUser:', credential.additionalUserInfo?.isNewUser);

      // Check if this is a new user and create Firestore document
      if (credential.additionalUserInfo?.isNewUser) {
        console.log('[AuthService] Step 5: Creating Firestore document for new user...');
        await FirestoreService.createUser(credential.user.uid, {
          displayName: credential.user.displayName || 'User',
          email: credential.user.email || '',
          organizationId: '',
          role: 'user',
          bands: [],
        });
        console.log('[AuthService] Step 5: Firestore document created');
      }

      console.log('[AuthService] Google Sign-In complete!');
      return mapFirebaseUser(credential.user);
    } catch (error: any) {
      console.log('[AuthService] Google Sign-In ERROR');
      console.log('[AuthService] Error code:', error?.code);
      console.log('[AuthService] Error message:', error?.message);
      console.log('[AuthService] Error name:', error?.name);
      console.log('[AuthService] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      // Handle Google Sign-In specific errors
      if (error.code === 'SIGN_IN_CANCELLED') {
        throw { code: 'google-signin/cancelled', message: 'Google sign-in was cancelled' };
      }
      throw parseAuthError(error);
    }
  },

  /**
   * Sign in with Apple (iOS only)
   */
  signInWithApple: async (): Promise<User> => {
    if (Platform.OS !== 'ios') {
      throw { code: 'apple-signin/not-supported', message: 'Apple Sign-In is only available on iOS' };
    }

    try {
      // Start the Apple sign-in request
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });

      // Ensure we have an identity token
      const { identityToken, nonce } = appleAuthRequestResponse;

      if (!identityToken) {
        throw { code: 'apple-signin/no-token', message: 'Failed to get Apple identity token' };
      }

      // Create an Apple credential with the token
      const appleCredential = auth.AppleAuthProvider.credential(identityToken, nonce);

      // Sign in to Firebase with the Apple credential
      const credential = await auth().signInWithCredential(appleCredential);

      // Apple only provides name on first sign-in, so we need to handle it
      let displayName = credential.user.displayName;
      if (!displayName && appleAuthRequestResponse.fullName) {
        const { givenName, familyName } = appleAuthRequestResponse.fullName;
        displayName = [givenName, familyName].filter(Boolean).join(' ') || 'User';
        await credential.user.updateProfile({ displayName });
      }

      // Check if this is a new user and create Firestore document
      if (credential.additionalUserInfo?.isNewUser) {
        await FirestoreService.createUser(credential.user.uid, {
          displayName: displayName || 'User',
          email: credential.user.email || '',
          organizationId: '',
          role: 'user',
          bands: [],
        });
      }

      return mapFirebaseUser(credential.user);
    } catch (error: any) {
      if (error.code === appleAuth.Error.CANCELED) {
        throw { code: 'apple-signin/cancelled', message: 'Apple sign-in was cancelled' };
      }
      throw parseAuthError(error);
    }
  },

  /**
   * Send password reset email
   */
  sendPasswordResetEmail: async (email: string): Promise<void> => {
    try {
      await auth().sendPasswordResetEmail(email);
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Send email verification to current user
   */
  sendEmailVerification: async (): Promise<void> => {
    try {
      const user = auth().currentUser;
      if (!user) {
        throw { code: 'auth/no-user', message: 'No user is currently signed in' };
      }
      await user.sendEmailVerification();
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Reload current user to get updated email verification status
   */
  reloadUser: async (): Promise<User | null> => {
    try {
      const user = auth().currentUser;
      if (!user) return null;
      await user.reload();
      return mapFirebaseUser(auth().currentUser!);
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Update user profile
   */
  updateProfile: async (data: { displayName?: string }): Promise<void> => {
    try {
      const user = auth().currentUser;
      if (!user) {
        throw { code: 'auth/no-user', message: 'No user is currently signed in' };
      }
      await user.updateProfile(data);

      // Also update Firestore document
      if (data.displayName) {
        await FirestoreService.updateUser(user.uid, { displayName: data.displayName });
      }
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Update user email
   */
  updateEmail: async (newEmail: string): Promise<void> => {
    try {
      const user = auth().currentUser;
      if (!user) {
        throw { code: 'auth/no-user', message: 'No user is currently signed in' };
      }
      await user.verifyBeforeUpdateEmail(newEmail);
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Update user password
   */
  updatePassword: async (newPassword: string): Promise<void> => {
    try {
      const user = auth().currentUser;
      if (!user) {
        throw { code: 'auth/no-user', message: 'No user is currently signed in' };
      }
      await user.updatePassword(newPassword);
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Re-authenticate user (required before sensitive operations)
   */
  reauthenticate: async (password: string): Promise<void> => {
    try {
      const user = getRequiredUser();
      await reauthenticateWithPassword(user, password);
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Delete user account
   */
  deleteAccount: async (password?: string): Promise<void> => {
    try {
      const user = getRequiredUser();
      const providerId = getPrimaryProviderId(user);

      if (providerId === PASSWORD_PROVIDER_ID) {
        await reauthenticateWithPassword(user, password);
      } else if (providerId === GOOGLE_PROVIDER_ID) {
        await reauthenticateWithGoogle(user);
      } else if (providerId === APPLE_PROVIDER_ID) {
        await reauthenticateWithApple(user);
      } else {
        throw {
          code: 'auth/unsupported-provider',
          message: 'This sign-in method is not yet supported for account deletion.',
        };
      }

      AppPresenceService.skipNextCleanupWrite();

      // Run destructive cleanup through a trusted backend so it can bypass client rules safely.
      await functions().httpsCallable('deleteAccount')();

      // Clear the local session after the backend removes the account.
      await AuthService.signOut();
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Sign out the current user
   */
  signOut: async (): Promise<void> => {
    try {
      // Sign out from Google if signed in with Google
      const currentGoogleUser = await GoogleSignin.getCurrentUser();
      if (currentGoogleUser) {
        await GoogleSignin.signOut();
      }

      // Sign out from Firebase
      await auth().signOut();
    } catch (error) {
      throw parseAuthError(error);
    }
  },
};
