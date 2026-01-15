import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { Platform } from 'react-native';
import { User, SignUpData, SignInData, AuthError } from '../../types/user';
import { FirestoreService } from './FirestoreService';

// Configure Google Sign-In
// The webClientId comes from google-services.json (client_type: 3)
GoogleSignin.configure({
  webClientId: '393568702648-35j8je711c8eh5t2n0pokqa1ce3uc2bj.apps.googleusercontent.com',
});

/**
 * Convert Firebase user to our User type
 */
const mapFirebaseUser = (firebaseUser: FirebaseAuthTypes.User): User => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
  emailVerified: firebaseUser.emailVerified,
});

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
  }

  return { code, message };
};

export const AuthService = {
  /**
   * Get the current authenticated user
   */
  getCurrentUser: (): User | null => {
    const firebaseUser = auth().currentUser;
    return firebaseUser ? mapFirebaseUser(firebaseUser) : null;
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
    try {
      // Check if device supports Google Play Services
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      // Get the user's ID token
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      
      if (!idToken) {
        throw { code: 'google-signin/no-token', message: 'Failed to get Google ID token' };
      }
      
      // Create a Google credential with the token
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      
      // Sign in to Firebase with the Google credential
      const credential = await auth().signInWithCredential(googleCredential);
      
      // Check if this is a new user and create Firestore document
      if (credential.additionalUserInfo?.isNewUser) {
        await FirestoreService.createUser(credential.user.uid, {
          displayName: credential.user.displayName || 'User',
          email: credential.user.email || '',
          bands: [],
        });
      }
      
      return mapFirebaseUser(credential.user);
    } catch (error: any) {
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
      const user = auth().currentUser;
      if (!user || !user.email) {
        throw { code: 'auth/no-user', message: 'No user is currently signed in' };
      }
      const credential = auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(credential);
    } catch (error) {
      throw parseAuthError(error);
    }
  },

  /**
   * Delete user account
   */
  deleteAccount: async (): Promise<void> => {
    try {
      const user = auth().currentUser;
      if (!user) {
        throw { code: 'auth/no-user', message: 'No user is currently signed in' };
      }
      
      // Delete Firestore data first
      await FirestoreService.deleteUser(user.uid);
      
      // Then delete the auth user
      await user.delete();
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
      const isGoogleSignedIn = await GoogleSignin.isSignedIn();
      if (isGoogleSignedIn) {
        await GoogleSignin.signOut();
      }
      
      // Sign out from Firebase
      await auth().signOut();
    } catch (error) {
      throw parseAuthError(error);
    }
  },
};
