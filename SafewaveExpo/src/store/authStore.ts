import { create } from 'zustand';
import { AuthService } from '../services/firebase/AuthService';
import { FirestoreService } from '../services/firebase/FirestoreService';
import {
  User,
  UserDocument,
  AuthState,
  SignUpData,
  SignInData,
  AuthError,
} from '../types/user';

interface AuthActions {
  // Initialization
  initialize: () => () => void;
  
  // Auth state
  setUser: (user: User | null) => void;
  setUserDocument: (userDocument: UserDocument | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Auth operations
  signInWithEmail: (data: SignInData) => Promise<void>;
  signUpWithEmail: (data: SignUpData) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state
  user: null,
  userDocument: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  // State setters
  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
    }),

  setUserDocument: (userDocument) => set({ userDocument }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  /**
   * Initialize auth state listener
   * Returns unsubscribe function
   */
  initialize: () => {
    let userDocUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = AuthService.onAuthStateChanged(async (user) => {
      // Clean up previous user document subscription
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
        userDocUnsubscribe = null;
      }

      if (user) {
        set({ user, isAuthenticated: true });

        // Subscribe to user document
        userDocUnsubscribe = FirestoreService.subscribeToUser(user.uid, (userDocument) => {
          set({ userDocument });
        });

        // Update last online
        await FirestoreService.updateLastOnline(user.uid).catch(console.error);
      } else {
        set({
          user: null,
          userDocument: null,
          isAuthenticated: false,
        });
      }

      set({ isLoading: false });
    });

    // Return cleanup function
    return () => {
      authUnsubscribe();
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
      }
    };
  },

  /**
   * Sign in with email and password
   */
  signInWithEmail: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await AuthService.signInWithEmail(data);
      // Auth state listener will handle the rest
    } catch (error) {
      const authError = error as AuthError;
      set({ error: authError.message, isLoading: false });
      throw error;
    }
  },

  /**
   * Sign up with email and password
   */
  signUpWithEmail: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await AuthService.signUpWithEmail(data);
      // Auth state listener will handle the rest
    } catch (error) {
      const authError = error as AuthError;
      set({ error: authError.message, isLoading: false });
      throw error;
    }
  },

  /**
   * Sign in with Google
   */
  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      await AuthService.signInWithGoogle();
      // Auth state listener will handle the rest
    } catch (error) {
      const authError = error as AuthError;
      // Don't show error for cancelled sign-in
      if (authError.code !== 'google-signin/cancelled') {
        set({ error: authError.message });
      }
      set({ isLoading: false });
      throw error;
    }
  },

  /**
   * Sign in with Apple
   */
  signInWithApple: async () => {
    set({ isLoading: true, error: null });
    try {
      await AuthService.signInWithApple();
      // Auth state listener will handle the rest
    } catch (error) {
      const authError = error as AuthError;
      // Don't show error for cancelled sign-in
      if (authError.code !== 'apple-signin/cancelled') {
        set({ error: authError.message });
      }
      set({ isLoading: false });
      throw error;
    }
  },

  /**
   * Send password reset email
   */
  sendPasswordResetEmail: async (email) => {
    set({ isLoading: true, error: null });
    try {
      await AuthService.sendPasswordResetEmail(email);
      set({ isLoading: false });
    } catch (error) {
      const authError = error as AuthError;
      set({ error: authError.message, isLoading: false });
      throw error;
    }
  },

  /**
   * Send email verification
   */
  sendEmailVerification: async () => {
    set({ error: null });
    try {
      await AuthService.sendEmailVerification();
    } catch (error) {
      const authError = error as AuthError;
      set({ error: authError.message });
      throw error;
    }
  },

  /**
   * Check if email is verified (reload user)
   */
  checkEmailVerification: async () => {
    try {
      const user = await AuthService.reloadUser();
      if (user) {
        set({ user });
        return user.emailVerified;
      }
      return false;
    } catch (error) {
      console.error('Error checking email verification:', error);
      return false;
    }
  },

  /**
   * Sign out
   */
  signOut: async () => {
    set({ isLoading: true, error: null });
    try {
      await AuthService.signOut();
      // Auth state listener will handle the rest
    } catch (error) {
      const authError = error as AuthError;
      set({ error: authError.message, isLoading: false });
      throw error;
    }
  },
}));
