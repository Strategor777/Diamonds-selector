import {
  GoogleAuthProvider,
  User,
  browserPopupRedirectResolver,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './firebase';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Basic Google Auth provider for Firebase Firestore cloud publishing (no Workspace Sheets consent screen)
const cloudProvider = new GoogleAuthProvider();
cloudProvider.setCustomParameters({ prompt: 'select_account' });

// Google Workspace provider with Sheets scope (used specifically in Google Sheets Workspace)
const sheetsProvider = new GoogleAuthProvider();
sheetsProvider.setCustomParameters({ prompt: 'select_account' });
for (const scope of SCOPES) {
  sheetsProvider.addScope(scope);
}

let cachedAccessToken: string | null = null;
let inFlightSignIn: Promise<{ user: User; accessToken: string | null }> | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
};

function runPopupSignIn(
  provider: GoogleAuthProvider
): Promise<{ user: User; accessToken: string | null }> {
  if (inFlightSignIn) {
    return inFlightSignIn;
  }

  // CRITICAL: Invoke signInWithPopup synchronously inside the user click handler (no awaits before this call)
  const popupPromise = signInWithPopup(auth, provider, browserPopupRedirectResolver)
    .then((result) => {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      try {
        window.focus();
      } catch {
        // ignore focus restrictions
      }
      return { user: result.user, accessToken: cachedAccessToken };
    })
    .finally(() => {
      inFlightSignIn = null;
    });

  inFlightSignIn = popupPromise;
  return popupPromise;
}

export const googleSignInForCloud = (): Promise<{
  user: User;
  accessToken: string | null;
}> => {
  return runPopupSignIn(cloudProvider);
};

export const googleSignIn = (): Promise<{
  user: User;
  accessToken: string | null;
}> => {
  return runPopupSignIn(sheetsProvider);
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export function formatGoogleAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  if (code === 'auth/popup-blocked') {
    return 'Браузер Chrome заблокировал всплывающее окно входа Google. Разрешите всплывающие окна для этого сайта в адресной строке и повторите попытку.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Окно входа Google было закрыто до завершения авторизации. Попробуйте нажать кнопку ещё раз.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Текущий домен не добавлен в список разрешённых для входа Google в настройках проекта Firebase.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Нет соединения с сервером авторизации Google. Проверьте подключение к интернету.';
  }
  if (err instanceof Error && err.message) {
    return `Не удалось выполнить вход через Google: ${err.message}`;
  }
  return 'Не удалось выполнить вход через Google. Попробуйте ещё раз.';
}
