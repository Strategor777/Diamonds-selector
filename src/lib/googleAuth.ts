import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;

function getSafeAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  try {
    cachedApp =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    cachedAuth = getAuth(cachedApp);
    return cachedAuth;
  } catch (err) {
    console.warn('Firebase Auth unavailable in current browser context:', err);
    return null;
  }
}

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  const auth = getSafeAuth();
  if (!auth) {
    onAuthFailure?.();
    return () => {};
  }

  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  const auth = getSafeAuth();
  if (!auth) {
    throw new Error(
      'Авторизация Google недоступна в текущем режиме браузера.'
    );
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Не удалось получить токен доступа Google Workspace.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  const auth = getSafeAuth();
  if (auth) {
    await auth.signOut();
  }
  cachedAccessToken = null;
};
