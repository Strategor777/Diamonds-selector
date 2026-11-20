import {
  GoogleAuthProvider,
  User,
  browserPopupRedirectResolver,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { auth } from './firebase';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export interface GoogleAuthErrorInfo {
  code: string;
  host: string;
  message: string;
}

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

export const isStandaloneWindow = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
};

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

export const consumeRedirectSignIn = async (): Promise<{
  user: User;
  accessToken: string | null;
} | null> => {
  const result = await getRedirectResult(auth, browserPopupRedirectResolver);
  if (!result) return null;
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    cachedAccessToken = credential.accessToken;
  }
  return { user: result.user, accessToken: cachedAccessToken };
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

export const googleSignInForCloudRedirect = (): Promise<never> => {
  return signInWithRedirect(auth, cloudProvider, browserPopupRedirectResolver);
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

export function parseGoogleAuthError(err: unknown): GoogleAuthErrorInfo {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || 'auth/unknown')
      : 'auth/unknown';
  const host =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : '';

  if (code === 'auth/popup-blocked') {
    return {
      code,
      host,
      message:
        'Браузер Chrome заблокировал всплывающее окно входа Google. Разрешите всплывающие окна в адресной строке или используйте кнопку «Войти в этой же вкладке».',
    };
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      code,
      host,
      message:
        'Окно входа Google было закрыто до завершения авторизации. Повторите попытку или используйте «Войти в этой же вкладке».',
    };
  }
  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      host,
      message: `Домен «${host || 'текущий домен'}» не добавлен в список разрешённых доменов Firebase (Authorized domains). Добавьте именно это имя домена в настройках проекта и повторите вход.`,
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      code,
      host,
      message:
        'Нет соединения с сервером авторизации Google. Проверьте подключение к интернету или отключите блокировщик/VPN для googleapis.com.',
    };
  }
  if (err instanceof Error && err.message) {
    return {
      code,
      host,
      message: `Ошибка входа через Google (${code}): ${err.message}`,
    };
  }
  return {
    code,
    host,
    message: `Не удалось выполнить вход через Google (${code}). Попробуйте ещё раз.`,
  };
}

export function formatGoogleAuthError(err: unknown): string {
  return parseGoogleAuthError(err).message;
}
