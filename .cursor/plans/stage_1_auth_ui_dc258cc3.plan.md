---
name: Stage 1 Auth UI
overview: Build the authentication UI screens (Login, Signup, Forgot Password, Verify Email) with React Navigation setup and the Safewave dark theme. No Firebase integration - just the UI foundation.
todos:
  - id: install-nav-deps
    content: Install React Navigation and required dependencies
    status: completed
  - id: create-theme
    content: Create theme/colors.ts with Safewave color palette
    status: completed
  - id: create-components
    content: Build reusable Button, TextInput, and Logo components
    status: completed
  - id: create-auth-screens
    content: Build Login, Signup, ForgotPassword, VerifyEmail screens
    status: completed
  - id: setup-auth-nav
    content: Create AuthNavigator and wire up in App.tsx
    status: completed
---

# Stage 1: Auth UI Screens

Build the auth flow UI foundation with navigation and themed screens. Firebase integration will come in a later stage.

## What We're Building

- 4 auth screens: Login, Signup, Forgot Password, Verify Email
- React Navigation stack for auth flow
- Safewave dark theme from PRD
- Reusable form components (inputs, buttons)

## Folder Structure

```javascript
SafewaveMobileApp/
└── src/
    ├── components/
    │   ├── Button.tsx
    │   ├── TextInput.tsx
    │   └── Logo.tsx
    ├── navigation/
    │   └── AuthNavigator.tsx
    ├── screens/
    │   └── auth/
    │       ├── LoginScreen.tsx
    │       ├── SignupScreen.tsx
    │       ├── ForgotPasswordScreen.tsx
    │       └── VerifyEmailScreen.tsx
    └── theme/
        └── colors.ts
```

## Dependencies to Install

```bash
npm install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-gesture-handler
```

## Auth Flow

```mermaid
flowchart LR
    Login --> Signup
    Login --> ForgotPassword
    Signup --> VerifyEmail
    ForgotPassword --> Login
    VerifyEmail --> Login
```

## Screen Details

| Screen | Key Elements ||--------|-------------|| Login | Email/password inputs, Google/Apple social buttons, links to Signup and Forgot Password || Signup | Name, email, password, confirm password fields, submit button || Forgot Password | Email input, submit button, back to login link || Verify Email | Confirmation message, resend email button, continue to login |

## Theme Reference

Using colors from PRD section 17:

- Background: `#00151E` (dark blue)
- Accent: `#1DAAE1` (cyan)