import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPhoneNumber,
  onAuthStateChanged,
  reauthenticateWithPopup,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword,
  updateProfile,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import { handleFirestoreError, formatFirestoreErrorMessage, OperationType } from '../lib/firestoreError';
import {
  ADMIN_EMAIL_SHA256_LIST,
  RESERVED_ADMIN_AUTH_EMAIL,
  RESERVED_ADMIN_PHONE,
} from '../lib/constants';
import {
  analyzePhoneNumber,
  canSendSmsOtp,
  getSmsCooldownRemainingSec,
  normalizeE164Phone,
  recordOtpVerificationFailure,
  recordSmsSent,
  resetOtpFailures,
  translatePhoneAuthError,
} from '../lib/phoneAuthUtils';
import { BLUEPRINT_LIMITS, sanitizeText } from '../lib/validation';
import type { AccountType, UserProfile } from '../types/platform';

export { normalizeE164Phone } from '../lib/phoneAuthUtils';

export interface WhatsAppAuthInput {
  rawPhone: string;
  secretCode: string;
  mode: 'login' | 'register';
  fullName?: string;
  accountType?: AccountType;
}

export interface SendPhoneOtpInput {
  rawPhone: string;
  recaptchaContainer: HTMLElement;
  fullName?: string;
  accountType?: AccountType;
}

export interface PendingPhoneOtpState {
  e164: string;
  operatorLabel: string;
  countryLabel: string;
  mode: 'signin' | 'link';
}

export interface AdminCodeConfigResult {
  ok: boolean;
  message: string;
  phoneCodeProvisioned?: boolean;
}

export interface AdminRegistryItem {
  uid: string;
  label?: string;
  email?: string;
  phone?: string;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  privatePhone: string;
  verifiedPhones: string[];
  isAdmin: boolean;
  isVerifiedOwner: boolean;
  hasPasswordAdminLinked: boolean;
  adminUidMissingDoc: boolean;
  isSuspended: boolean;
  authReady: boolean;
  authError: string | null;
  authModalOpen: boolean;
  whatsappProviderSetupHint: boolean;
  phoneProviderSetupHint: boolean;
  smsCooldownSec: number;
  pendingPhoneOtp: PendingPhoneOtpState | null;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  signInWithGoogle: (
    rawWhatsAppPhone?: string,
    preferredAccountType?: AccountType,
  ) => Promise<boolean>;
  signInWithGoogleSelectAccount: (options?: { redirectToAdmin?: boolean }) => Promise<boolean>;
  signInWithWhatsApp: (input: WhatsAppAuthInput) => Promise<boolean>;
  signInAdminWithPhonePassword: (rawIdentifier: string, password: string) => Promise<boolean>;
  configureAdminAccessCode: (input: {
    newCode: string;
    previousPhoneCode?: string;
  }) => Promise<AdminCodeConfigResult>;
  listAdminRegistry: () => Promise<AdminRegistryItem[]>;
  sendPhoneOtp: (input: SendPhoneOtpInput) => Promise<boolean>;
  confirmPhoneOtp: (code: string) => Promise<boolean>;
  sendAdditionalPhoneOtp: (
    rawPhone: string,
    recaptchaContainer: HTMLElement,
  ) => Promise<boolean>;
  confirmAdditionalPhoneOtp: (code: string) => Promise<boolean>;
  cancelPhoneOtp: () => void;
  removeVerifiedPhone: (e164: string) => Promise<boolean>;
  saveWhatsAppNumber: (rawPhone: string) => Promise<boolean>;
  clearAuthError: () => void;
  signOutUser: () => Promise<void>;
  updateLocalProfile: (patch: Partial<UserProfile>, phone?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem('qolock-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return 'dark';
}

export function isSyntheticWhatsAppEmail(email?: string | null): boolean {
  return Boolean(email && /^wa\.\d+@qolock\.app$/i.test(email));
}

function whatsappPhoneToAuthEmail(e164: string): string {
  const digits = e164.replace(/[^0-9]/g, '');
  return `wa.${digits}@qolock.app`;
}

function getFirebaseAuthErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: string }).code || '');
  }
  return '';
}

async function verifyOwnerEmailHash(email?: string | null): Promise<boolean> {
  if (!email || typeof globalThis.crypto?.subtle === 'undefined') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const encoded = new TextEncoder().encode(normalized);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return (ADMIN_EMAIL_SHA256_LIST as readonly string[]).includes(hex);
}

export const ADMIN_REDIRECT_SESSION_KEY = 'gidacolocs_pending_admin_view';
const ADMIN_RATE_LIMIT_KEY = 'gidacolocs_admin_code_rl_v1';
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 60_000;

interface AdminRateState {
  failures: number;
  lockedUntil: number;
}

function readAdminRateState(): AdminRateState {
  if (typeof window === 'undefined') return { failures: 0, lockedUntil: 0 };
  try {
    const raw = window.sessionStorage.getItem(ADMIN_RATE_LIMIT_KEY);
    if (!raw) return { failures: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<AdminRateState>;
    return {
      failures: typeof parsed.failures === 'number' ? parsed.failures : 0,
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
    };
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

function writeAdminRateState(state: AdminRateState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ADMIN_RATE_LIMIT_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

function translateGoogleAuthError(error: unknown): string | null {
  const code = getFirebaseAuthErrorCode(error);
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return null;
  }
  if (code === 'auth/popup-blocked') {
    return 'La fenêtre Google a été bloquée par votre navigateur. Autorisez les fenêtres contextuelles ou utilisez la connexion par code administrateur.';
  }
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'ce domaine';
    return `Le domaine « ${host} » n’est pas encore autorisé dans Firebase Authentication (Domaines autorisés). Ajoutez « ${host} » dans la console Firebase ou connectez-vous via votre code administrateur.`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Connexion Internet indisponible. Vérifiez votre réseau et réessayez.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'La connexion Google n’est pas activée sur ce projet Firebase.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'Un compte existe déjà avec cette adresse via une autre méthode de connexion.';
  }
  if (code === 'auth/user-disabled') {
    return 'Ce compte a été désactivé. Contactez l’assistance GidaColocs.';
  }
  return error instanceof Error ? error.message : 'Connexion Google impossible pour le moment.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privatePhone, setPrivatePhone] = useState('');
  const [verifiedPhones, setVerifiedPhones] = useState<string[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [whatsappProviderSetupHint, setWhatsappProviderSetupHint] = useState(false);
  const [phoneProviderSetupHint, setPhoneProviderSetupHint] = useState(false);
  const [smsCooldownSec, setSmsCooldownSec] = useState<number>(() => getSmsCooldownRemainingSec());
  const [pendingPhoneOtp, setPendingPhoneOtp] = useState<PendingPhoneOtpState | null>(null);
  const [isVerifiedOwner, setIsVerifiedOwner] = useState(false);
  const [adminDocExists, setAdminDocExists] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(resolveInitialTheme);

  const pendingDisplayNameRef = useRef<string>('');
  const pendingWhatsAppPhoneRef = useRef<string>('');
  const pendingAccountTypeRef = useRef<AccountType | null>(null);
  const authSyncSeqRef = useRef(0);

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const secondaryAppRef = useRef<FirebaseApp | null>(null);
  const linkUsesPrimaryProviderRef = useRef<boolean>(false);

  const cleanupPhoneSession = useCallback(async () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // Ignore cleanup errors if container was unmounted
      }
      recaptchaVerifierRef.current = null;
    }
    confirmationResultRef.current = null;
    linkUsesPrimaryProviderRef.current = false;
    if (secondaryAppRef.current) {
      const appToDelete = secondaryAppRef.current;
      secondaryAppRef.current = null;
      try {
        const secAuth = getAuth(appToDelete);
        await signOut(secAuth);
      } catch {
        // Ignore secondary signout errors
      }
      try {
        await deleteApp(appToDelete);
      } catch {
        // Ignore secondary delete errors
      }
    }
  }, []);

  useEffect(() => {
    if (smsCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setSmsCooldownSec(getSmsCooldownRemainingSec());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCooldownSec]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('qolock-theme', theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      void cleanupPhoneSession();
    };
  }, [cleanupPhoneSession]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setWhatsappProviderSetupHint(false);
    setPhoneProviderSetupHint(false);
  }, []);

  const cancelPhoneOtp = useCallback(() => {
    setPendingPhoneOtp(null);
    pendingDisplayNameRef.current = '';
    pendingWhatsAppPhoneRef.current = '';
    pendingAccountTypeRef.current = null;
    void cleanupPhoneSession();
  }, [cleanupPhoneSession]);

  const openAuthModal = useCallback(() => {
    setAuthError(null);
    setWhatsappProviderSetupHint(false);
    setPhoneProviderSetupHint(false);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
    setAuthError(null);
    setWhatsappProviderSetupHint(false);
    setPhoneProviderSetupHint(false);
    cancelPhoneOtp();
  }, [cancelPhoneOtp]);

  const syncUserProfile = useCallback(async (firebaseUser: User) => {
    const userPath = `users/${firebaseUser.uid}`;
    const privatePath = `users/${firebaseUser.uid}/private/info`;
    const syntheticEmail = isSyntheticWhatsAppEmail(firebaseUser.email);
    const cleanEmail = syntheticEmail
      ? ''
      : sanitizeText((firebaseUser.email || '').toLowerCase(), BLUEPRINT_LIMITS.EMAIL_MAX);

    const pendingPhone = pendingWhatsAppPhoneRef.current;
    const fallbackPhoneLabel =
      pendingPhone || firebaseUser.phoneNumber
        ? `Membre ${(pendingPhone || firebaseUser.phoneNumber || '').slice(-4)}`
        : 'Membre GidaColocs';

    const displayName = sanitizeText(
      pendingDisplayNameRef.current ||
        firebaseUser.displayName ||
        (!syntheticEmail && firebaseUser.email ? firebaseUser.email.split('@')[0] : '') ||
        fallbackPhoneLabel,
      BLUEPRINT_LIMITS.DISPLAY_NAME_MAX,
    );
    const photoURL = (firebaseUser.photoURL || '').slice(0, BLUEPRINT_LIMITS.PHOTO_URL_MAX);
    const desiredAccountType: AccountType = pendingAccountTypeRef.current || 'tenant';

    let resolvedProfile: UserProfile = {
      uid: firebaseUser.uid,
      displayName,
      photoURL,
      accountType: desiredAccountType,
      neighborhood: '',
    };
    let resolvedPhone = pendingPhone || firebaseUser.phoneNumber || '';

    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: firebaseUser.uid,
          displayName,
          photoURL,
          accountType: desiredAccountType,
          neighborhood: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingData = snap.data() as Partial<UserProfile>;
        const accountType: AccountType =
          existingData.accountType === 'landlord' ? 'landlord' : 'tenant';
        const accountStatus = existingData.accountStatus === 'suspended' ? 'suspended' : 'active';
        resolvedProfile = {
          uid: firebaseUser.uid,
          displayName: existingData.displayName || displayName,
          photoURL: photoURL || existingData.photoURL || '',
          accountType,
          neighborhood: existingData.neighborhood || '',
          accountStatus,
          suspendedReason: existingData.suspendedReason || '',
        };
        await updateDoc(userRef, {
          displayName: resolvedProfile.displayName,
          photoURL: resolvedProfile.photoURL,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userPath);
    }

    let nextVerifiedPhones: string[] = [];
    try {
      const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'info');
      const privateSnap = await getDoc(privateRef);
      let hadVerifiedPhonesField = false;

      if (privateSnap.exists()) {
        const existingPrivate = privateSnap.data() as {
          phone?: string;
          verifiedPhones?: unknown;
        };
        if (!pendingPhone && existingPrivate.phone) {
          resolvedPhone = String(existingPrivate.phone);
        }
        if (Array.isArray(existingPrivate.verifiedPhones)) {
          hadVerifiedPhonesField = true;
          nextVerifiedPhones = existingPrivate.verifiedPhones
            .filter((item): item is string => typeof item === 'string' && item.trim().length >= 6)
            .map((item) => sanitizeText(item, BLUEPRINT_LIMITS.PHONE_MAX))
            .slice(0, 5);
        }
      }

      if (firebaseUser.phoneNumber) {
        const cleanAuthPhone = sanitizeText(firebaseUser.phoneNumber, BLUEPRINT_LIMITS.PHONE_MAX);
        if (cleanAuthPhone && !nextVerifiedPhones.includes(cleanAuthPhone) && nextVerifiedPhones.length < 5) {
          nextVerifiedPhones = [cleanAuthPhone, ...nextVerifiedPhones].slice(0, 5);
        }
      }

      const privatePayload: Record<string, unknown> = {
        email: cleanEmail,
        phone: sanitizeText(resolvedPhone, BLUEPRINT_LIMITS.PHONE_MAX),
        updatedAt: serverTimestamp(),
      };
      if (nextVerifiedPhones.length > 0 || hadVerifiedPhonesField) {
        privatePayload.verifiedPhones = nextVerifiedPhones;
      }

      await setDoc(privateRef, privatePayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }

    pendingDisplayNameRef.current = '';
    pendingWhatsAppPhoneRef.current = '';
    pendingAccountTypeRef.current = null;
    setProfile(resolvedProfile);
    setPrivatePhone(resolvedPhone);
    setVerifiedPhones(nextVerifiedPhones);
  }, []);

  useEffect(() => {
    void getRedirectResult(auth).catch((error) => {
      const msg = translateGoogleAuthError(error);
      if (msg) setAuthError(msg);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const seq = ++authSyncSeqRef.current;

      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setPrivatePhone('');
        setVerifiedPhones([]);
        setIsVerifiedOwner(false);
        setAdminDocExists(false);
        setAuthReady(true);
        return;
      }

      setAuthReady(false);
      setIsVerifiedOwner(false);
      setAdminDocExists(false);

      try {
        await syncUserProfile(firebaseUser);
        if (seq !== authSyncSeqRef.current) return;

        let ownerMatched = false;
        let isGoogleProvider = false;
        if (firebaseUser.email) {
          try {
            const tokenResult = await firebaseUser.getIdTokenResult(true);
            isGoogleProvider = tokenResult?.signInProvider === 'google.com';
            if (isGoogleProvider) {
              ownerMatched = await verifyOwnerEmailHash(firebaseUser.email);
            }
          } catch {
            ownerMatched = false;
          }
        }

        let hasAdminDoc = false;
        try {
          const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
          hasAdminDoc = adminSnap.exists();
        } catch {
          hasAdminDoc = false;
        }

        if (ownerMatched && !hasAdminDoc && isGoogleProvider) {
          try {
            const cleanOwnerEmail = sanitizeText(
              (firebaseUser.email || '').toLowerCase(),
              BLUEPRINT_LIMITS.EMAIL_MAX,
            );
            const cleanOwnerLabel = sanitizeText(
              firebaseUser.displayName || 'Propriétaire GidaColocs',
              100,
            );
            await setDoc(doc(db, 'admins', firebaseUser.uid), {
              uid: firebaseUser.uid,
              role: 'admin',
              label: cleanOwnerLabel,
              email: cleanOwnerEmail,
              createdBy: firebaseUser.uid,
              updatedAt: serverTimestamp(),
            });
            hasAdminDoc = true;
          } catch (adminProvisionErr) {
            console.warn('Could not auto-provision /admins/{uid} doc for Google owner:', adminProvisionErr);
          }
        }
        if (seq !== authSyncSeqRef.current) return;

        setIsVerifiedOwner(ownerMatched);
        setAdminDocExists(hasAdminDoc);
        setUser(firebaseUser);
        setAuthModalOpen(false);
      } catch (err) {
        if (seq !== authSyncSeqRef.current) return;
        setUser(firebaseUser);
        setAuthError(
          formatFirestoreErrorMessage(err, 'Erreur lors de la synchronisation du profil.'),
        );
      } finally {
        if (seq === authSyncSeqRef.current) {
          setAuthReady(true);
        }
      }
    });
    return () => unsubscribe();
  }, [syncUserProfile]);

  const signInWithGoogle = useCallback(
    async (
      rawWhatsAppPhone?: string,
      preferredAccountType?: AccountType,
    ): Promise<boolean> => {
      setAuthError(null);
      setWhatsappProviderSetupHint(false);
      setPhoneProviderSetupHint(false);

      if (rawWhatsAppPhone?.trim()) {
        const normalized = normalizeE164Phone(rawWhatsAppPhone);
        if (/^\+[1-9]\d{6,14}$/.test(normalized)) {
          pendingWhatsAppPhoneRef.current = normalized;
        }
      }
      if (preferredAccountType) {
        pendingAccountTypeRef.current = preferredAccountType;
      }

      try {
        await signInWithPopup(auth, googleProvider);
        setAuthModalOpen(false);
        return true;
      } catch (error) {
        const errCode = getFirebaseAuthErrorCode(error);
        const isStandaloneWindow = typeof window !== 'undefined' && window.self === window.top;
        if (errCode === 'auth/popup-blocked' && isStandaloneWindow) {
          try {
            await signInWithRedirect(auth, googleProvider);
            return true;
          } catch (redirectError) {
            const redirectMsg = translateGoogleAuthError(redirectError);
            if (redirectMsg) setAuthError(redirectMsg);
          }
        }
        pendingWhatsAppPhoneRef.current = '';
        pendingAccountTypeRef.current = null;
        const msg = translateGoogleAuthError(error);
        if (msg) {
          setAuthError(msg);
        }
        return false;
      }
    },
    [],
  );

  const signInWithGoogleSelectAccount = useCallback(
    async (options?: { redirectToAdmin?: boolean }): Promise<boolean> => {
      setAuthError(null);
      setWhatsappProviderSetupHint(false);
      setPhoneProviderSetupHint(false);
      const selectorProvider = new GoogleAuthProvider();
      selectorProvider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, selectorProvider);
        setAuthModalOpen(false);
        return true;
      } catch (error) {
        const errCode = getFirebaseAuthErrorCode(error);
        const isStandaloneWindow = typeof window !== 'undefined' && window.self === window.top;
        if (errCode === 'auth/popup-blocked' && isStandaloneWindow) {
          try {
            if (options?.redirectToAdmin && typeof window !== 'undefined') {
              window.sessionStorage.setItem(ADMIN_REDIRECT_SESSION_KEY, '1');
            }
            await signInWithRedirect(auth, selectorProvider);
            return true;
          } catch (redirectError) {
            if (typeof window !== 'undefined') {
              window.sessionStorage.removeItem(ADMIN_REDIRECT_SESSION_KEY);
            }
            const redirectMsg = translateGoogleAuthError(redirectError);
            if (redirectMsg) setAuthError(redirectMsg);
            return false;
          }
        }
        const msg = translateGoogleAuthError(error);
        if (msg) {
          setAuthError(msg);
        }
        return false;
      }
    },
    [],
  );

  const signInWithWhatsApp = useCallback(
    async ({
      rawPhone,
      secretCode,
      mode,
      fullName,
      accountType,
    }: WhatsAppAuthInput): Promise<boolean> => {
      setAuthError(null);
      setWhatsappProviderSetupHint(false);
      setPhoneProviderSetupHint(false);

      const e164 = normalizeE164Phone(rawPhone);
      if (!/^\+[1-9]\d{6,14}$/.test(e164)) {
        setAuthError(
          'Numéro invalide. Saisissez un numéro valide pour le pays sélectionné (ex. 70000000).',
        );
        return false;
      }

      if (mode === 'register' && e164 === RESERVED_ADMIN_PHONE) {
        setAuthError(
          'Ce numéro ne peut pas être utilisé pour créer un compte membre.',
        );
        return false;
      }

      const trimmedCode = secretCode.trim();
      if (trimmedCode.length < 6) {
        setAuthError(
          'Votre code secret personnel doit contenir au moins 6 caractères pour sécuriser votre espace.',
        );
        return false;
      }

      if (mode === 'register') {
        const cleanName = sanitizeText(fullName || '', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
        if (cleanName.length < 2) {
          setAuthError('Indiquez votre nom complet pour créer votre espace GidaColocs.');
          return false;
        }
        pendingDisplayNameRef.current = cleanName;
        pendingAccountTypeRef.current = accountType || 'tenant';
      }

      pendingWhatsAppPhoneRef.current = e164;
      const authEmail = whatsappPhoneToAuthEmail(e164);

      try {
        if (mode === 'register') {
          const cred = await createUserWithEmailAndPassword(auth, authEmail, trimmedCode);
          if (pendingDisplayNameRef.current && cred.user) {
            try {
              await updateProfile(cred.user, {
                displayName: pendingDisplayNameRef.current,
              });
            } catch {
              // Firestore profile still receives pendingDisplayNameRef
            }
          }
        } else {
          await signInWithEmailAndPassword(auth, authEmail, trimmedCode);
        }
        setAuthModalOpen(false);
        return true;
      } catch (error: unknown) {
        pendingDisplayNameRef.current = '';
        pendingWhatsAppPhoneRef.current = '';
        pendingAccountTypeRef.current = null;

        const errCode = getFirebaseAuthErrorCode(error);

        if (errCode === 'auth/operation-not-allowed') {
          setWhatsappProviderSetupHint(true);
          setAuthError(
            'La connexion par numéro WhatsApp + code attend l’activation du fournisseur « E-mail/Mot de passe » dans Firebase. Utilisez la connexion Google ci-dessous.',
          );
        } else if (errCode === 'auth/email-already-in-use') {
          setAuthError(
            'Ce numéro WhatsApp possède déjà un espace. Passez sur « Me connecter » et entrez votre code.',
          );
        } else if (
          errCode === 'auth/invalid-credential' ||
          errCode === 'auth/wrong-password' ||
          errCode === 'auth/user-not-found'
        ) {
          setAuthError(
            'Numéro ou code incorrect. Vérifiez vos identifiants ou cliquez sur « Créer mon accès ».',
          );
        } else if (errCode === 'auth/invalid-email') {
          setAuthError('Format de numéro invalide. Vérifiez les chiffres saisis.');
        } else if (errCode === 'auth/weak-password') {
          setAuthError('Choisissez un code d’accès plus long (minimum 6 caractères).');
        } else if (errCode === 'auth/network-request-failed') {
          setAuthError(
            'Connexion Internet indisponible. Vérifiez votre connexion et réessayez.',
          );
        } else if (errCode === 'auth/user-disabled') {
          setAuthError(
            'Ce compte a été désactivé. Contactez l’assistance GidaColocs sur WhatsApp.',
          );
        } else if (errCode === 'auth/too-many-requests') {
          setAuthError(
            'Trop de tentatives. Patientez quelques instants ou utilisez Google en 1 clic ci-dessous.',
          );
        } else {
          setAuthError(
            error instanceof Error
              ? error.message
              : 'Impossible de vous connecter pour le moment.',
          );
        }
        return false;
      }
    },
    [],
  );

  const signInAdminWithPhonePassword = useCallback(
    async (rawIdentifier: string, password: string): Promise<boolean> => {
      setAuthError(null);
      setWhatsappProviderSetupHint(false);
      setPhoneProviderSetupHint(false);

      const rateState = readAdminRateState();
      const now = Date.now();
      if (rateState.lockedUntil > now) {
        const waitSec = Math.ceil((rateState.lockedUntil - now) / 1000);
        setAuthError(
          `Sécurité anti-intrusion active : patientez ${waitSec}s avant une nouvelle tentative par code.`,
        );
        return false;
      }

      const trimmed = rawIdentifier.trim();
      const isEmailInput = trimmed.includes('@');
      let targetEmail = RESERVED_ADMIN_AUTH_EMAIL;

      if (!trimmed) {
        targetEmail = RESERVED_ADMIN_AUTH_EMAIL;
        pendingWhatsAppPhoneRef.current = RESERVED_ADMIN_PHONE;
      } else if (isEmailInput) {
        const lowerEmail = trimmed.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowerEmail)) {
          setAuthError('Adresse e-mail administrateur invalide.');
          return false;
        }
        targetEmail = lowerEmail;
        pendingWhatsAppPhoneRef.current = '';
      } else {
        const e164 = normalizeE164Phone(trimmed, '+229');
        if (e164 !== RESERVED_ADMIN_PHONE) {
          setAuthError(
            'Identifiant administrateur non autorisé. Saisissez le numéro administrateur, votre e-mail administrateur, ou laissez vide pour le code principal.',
          );
          return false;
        }
        targetEmail = RESERVED_ADMIN_AUTH_EMAIL;
        pendingWhatsAppPhoneRef.current = RESERVED_ADMIN_PHONE;
      }

      if (!password || password.length < 6) {
        setAuthError('Saisissez votre code d’accès administrateur (6 caractères minimum).');
        return false;
      }

      pendingDisplayNameRef.current = 'Administrateur GidaColocs';

      try {
        const cred = await signInWithEmailAndPassword(auth, targetEmail, password);
        await cred.user.getIdTokenResult(true);
        let hasAdminDoc = false;
        try {
          const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
          hasAdminDoc = adminSnap.exists();
        } catch {
          hasAdminDoc = false;
        }
        setAdminDocExists(hasAdminDoc);
        if (!hasAdminDoc) {
          await signOut(auth);
          setAuthError(
            isEmailInput
              ? `Ce compte (${targetEmail}) n’a pas encore d’autorisation administrateur dans Firestore (/admins/${cred.user.uid}). Connectez-vous d’abord avec Google administrateur pour l’activer.`
              : 'Code reconnu sur Firebase Auth, mais le document administrateur côté serveur (/admins/{uid}) n’est pas encore activé. Connectez-vous d’abord via Google administrateur et enregistrez le code dans Paramètres.',
          );
          return false;
        }
        writeAdminRateState({ failures: 0, lockedUntil: 0 });
        return true;
      } catch (error: unknown) {
        pendingWhatsAppPhoneRef.current = '';
        pendingDisplayNameRef.current = '';
        const errCode = getFirebaseAuthErrorCode(error);

        if (
          errCode === 'auth/invalid-credential' ||
          errCode === 'auth/wrong-password' ||
          errCode === 'auth/user-not-found'
        ) {
          const nextFailures = rateState.failures + 1;
          if (nextFailures >= ADMIN_MAX_ATTEMPTS) {
            writeAdminRateState({
              failures: 0,
              lockedUntil: Date.now() + ADMIN_LOCKOUT_MS,
            });
            setAuthError(
              'Trop de tentatives incorrectes. Par sécurité, patientez 60 secondes ou utilisez « Connexion Google administrateur ».',
            );
          } else {
            writeAdminRateState({ failures: nextFailures, lockedUntil: 0 });
            setAuthError(
              targetEmail === RESERVED_ADMIN_AUTH_EMAIL && !trimmed
                ? 'Code d’accès incorrect ou non encore configuré. Connectez-vous d’abord avec Google administrateur pour définir votre code dans Paramètres.'
                : `Identifiant ou code d’accès incorrect pour ${targetEmail}. Vérifiez votre saisie ou connectez-vous via Google administrateur.`,
            );
          }
        } else if (errCode === 'auth/too-many-requests') {
          setAuthError('Trop de tentatives. Patientez quelques instants avant de réessayer.');
        } else if (errCode === 'auth/network-request-failed') {
          setAuthError('Connexion Internet indisponible. Vérifiez votre réseau et réessayez.');
        } else if (errCode === 'auth/operation-not-allowed') {
          setAuthError(
            'Le fournisseur E-mail/Mot de passe doit être activé dans Firebase Authentication pour autoriser la connexion par code.',
          );
        } else if (errCode === 'auth/user-disabled') {
          setAuthError('Ce compte administrateur a été désactivé dans Firebase.');
        } else {
          setAuthError(
            error instanceof Error
              ? error.message
              : 'Impossible de connecter l’espace administrateur.',
          );
        }
        return false;
      }
    },
    [],
  );

  const configureAdminAccessCode = useCallback(
    async ({
      newCode,
      previousPhoneCode,
    }: {
      newCode: string;
      previousPhoneCode?: string;
    }): Promise<AdminCodeConfigResult> => {
      if (!user || !isVerifiedOwner || !user.email) {
        return {
          ok: false,
          message:
            'Connectez-vous avec votre compte Google propriétaire autorisé pour définir le code d’accès administrateur.',
        };
      }

      const cleanCode = newCode.trim();
      if (cleanCode.length < 8 || cleanCode.length > 64) {
        return {
          ok: false,
          message: 'Le code administrateur doit contenir entre 8 et 64 caractères.',
        };
      }

      const cleanOwnerEmail = sanitizeText(user.email.toLowerCase(), BLUEPRINT_LIMITS.EMAIL_MAX);

      try {
        await setDoc(doc(db, 'admins', user.uid), {
          uid: user.uid,
          role: 'admin',
          label: sanitizeText(user.displayName || 'Propriétaire GidaColocs', 100),
          email: cleanOwnerEmail,
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
        });
        setAdminDocExists(true);
      } catch (err) {
        return {
          ok: false,
          message: formatFirestoreErrorMessage(
            err,
            'Impossible d’enregistrer l’autorisation administrateur dans Firestore.',
          ),
        };
      }

      const hasPasswordProvider = user.providerData.some((p) => p?.providerId === 'password');
      try {
        if (!hasPasswordProvider) {
          const cred = EmailAuthProvider.credential(cleanOwnerEmail, cleanCode);
          await linkWithCredential(user, cred);
        } else {
          await updatePassword(user, cleanCode);
        }
      } catch (error) {
        const errCode = getFirebaseAuthErrorCode(error);
        if (errCode === 'auth/requires-recent-login') {
          try {
            const reauthProvider = new GoogleAuthProvider();
            reauthProvider.setCustomParameters({ prompt: 'select_account' });
            await reauthenticateWithPopup(user, reauthProvider);
            if (!hasPasswordProvider) {
              await linkWithCredential(user, EmailAuthProvider.credential(cleanOwnerEmail, cleanCode));
            } else {
              await updatePassword(user, cleanCode);
            }
          } catch (reauthErr) {
            return {
              ok: false,
              message:
                translateGoogleAuthError(reauthErr) ||
                'Re-authentification Google requise pour modifier le code d’accès.',
            };
          }
        } else if (errCode === 'auth/operation-not-allowed') {
          return {
            ok: false,
            message:
              'Activez le fournisseur « E-mail/Mot de passe » dans Firebase Console > Authentication > Sign-in method.',
          };
        } else {
          return {
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : 'Impossible d’enregistrer le code d’accès administrateur.',
          };
        }
      }

      let phoneCodeProvisioned = false;
      let secApp: FirebaseApp | null = null;
      try {
        secApp = initializeApp(auth.app.options, `qolock_admin_code_${Date.now()}`);
        const secAuth = getAuth(secApp);
        try {
          const secCred = await createUserWithEmailAndPassword(
            secAuth,
            RESERVED_ADMIN_AUTH_EMAIL,
            cleanCode,
          );
          await setDoc(doc(db, 'admins', secCred.user.uid), {
            uid: secCred.user.uid,
            role: 'admin',
            label: 'Code administrateur principal',
            email: RESERVED_ADMIN_AUTH_EMAIL,
            phone: RESERVED_ADMIN_PHONE,
            createdBy: user.uid,
            updatedAt: serverTimestamp(),
          });
          phoneCodeProvisioned = true;
        } catch (secErr) {
          const secCode = getFirebaseAuthErrorCode(secErr);
          if (secCode === 'auth/email-already-in-use' && previousPhoneCode?.trim()) {
            const secCred = await signInWithEmailAndPassword(
              secAuth,
              RESERVED_ADMIN_AUTH_EMAIL,
              previousPhoneCode.trim(),
            );
            await updatePassword(secCred.user, cleanCode);
            await setDoc(doc(db, 'admins', secCred.user.uid), {
              uid: secCred.user.uid,
              role: 'admin',
              label: 'Code administrateur principal',
              email: RESERVED_ADMIN_AUTH_EMAIL,
              phone: RESERVED_ADMIN_PHONE,
              createdBy: user.uid,
              updatedAt: serverTimestamp(),
            });
            phoneCodeProvisioned = true;
          }
        }
      } catch {
        // Non-blocking: owner email + code already active
      } finally {
        if (secApp) {
          try {
            await signOut(getAuth(secApp));
          } catch {
            // Ignore secondary signOut cleanup errors
          }
          try {
            await deleteApp(secApp);
          } catch {
            // Ignore secondary delete cleanup errors
          }
        }
      }

      return {
        ok: true,
        phoneCodeProvisioned,
        message: phoneCodeProvisioned
          ? `Code administrateur activé pour ${cleanOwnerEmail}, le numéro ${RESERVED_ADMIN_PHONE} et la connexion par code direct.`
          : `Code administrateur activé pour ${cleanOwnerEmail}. Vous pouvez vous connecter avec ${cleanOwnerEmail} et ce code.`,
      };
    },
    [isVerifiedOwner, user],
  );

  const listAdminRegistry = useCallback(async (): Promise<AdminRegistryItem[]> => {
    if (!user) return [];
    try {
      const snap = await getDocs(collection(db, 'admins'));
      return snap.docs.map((d) => {
        const data = d.data() as {
          uid?: string;
          label?: string;
          email?: string;
          phone?: string;
        };
        return {
          uid: data.uid || d.id,
          label: data.label,
          email: data.email,
          phone: data.phone,
        };
      });
    } catch {
      return [];
    }
  }, [user]);

  const sendPhoneOtp = useCallback(
    async ({
      rawPhone,
      recaptchaContainer,
      fullName,
      accountType,
    }: SendPhoneOtpInput): Promise<boolean> => {
      setAuthError(null);
      setWhatsappProviderSetupHint(false);
      setPhoneProviderSetupHint(false);

      const e164 = normalizeE164Phone(rawPhone);
      const analysis = analyzePhoneNumber(e164);
      if (!analysis.isValid) {
        setAuthError(analysis.error || 'Numéro de téléphone invalide.');
        return false;
      }

      const guard = canSendSmsOtp();
      if (!guard.allowed) {
        setSmsCooldownSec(guard.waitSec);
        setAuthError(guard.reason || 'Patientez avant de demander un nouveau code SMS.');
        return false;
      }

      await cleanupPhoneSession();

      if (fullName?.trim()) {
        pendingDisplayNameRef.current = sanitizeText(fullName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
      }
      if (accountType) {
        pendingAccountTypeRef.current = accountType;
      }
      pendingWhatsAppPhoneRef.current = e164;

      try {
        recaptchaContainer.innerHTML = '';
        const verifier = new RecaptchaVerifier(auth, recaptchaContainer, {
          size: 'invisible',
        });
        recaptchaVerifierRef.current = verifier;
        const result = await signInWithPhoneNumber(auth, e164, verifier);
        confirmationResultRef.current = result;
        recordSmsSent();
        setSmsCooldownSec(getSmsCooldownRemainingSec());
        setPendingPhoneOtp({
          e164,
          operatorLabel: analysis.operatorLabel,
          countryLabel: analysis.countryLabel,
          mode: 'signin',
        });
        return true;
      } catch (error: unknown) {
        pendingDisplayNameRef.current = '';
        pendingWhatsAppPhoneRef.current = '';
        pendingAccountTypeRef.current = null;
        await cleanupPhoneSession();

        const code = getFirebaseAuthErrorCode(error);
        if (code === 'auth/operation-not-allowed' || code === 'auth/quota-exceeded') {
          setPhoneProviderSetupHint(true);
        }
        setAuthError(translatePhoneAuthError(error));
        return false;
      }
    },
    [cleanupPhoneSession],
  );

  const confirmPhoneOtp = useCallback(
    async (code: string): Promise<boolean> => {
      setAuthError(null);
      const confirmation = confirmationResultRef.current;
      if (!confirmation || pendingPhoneOtp?.mode !== 'signin') {
        setAuthError('Aucune demande de code SMS active. Demandez un nouveau code.');
        return false;
      }

      const cleanCode = code.replace(/\D/g, '');
      if (cleanCode.length !== 6) {
        setAuthError('Saisissez les 6 chiffres du code reçu par SMS.');
        return false;
      }

      try {
        const cred = await confirmation.confirm(cleanCode);
        if (pendingDisplayNameRef.current && cred.user && !cred.user.displayName) {
          try {
            await updateProfile(cred.user, {
              displayName: pendingDisplayNameRef.current,
            });
          } catch {
            // Firestore sync still stores pendingDisplayNameRef
          }
        }
        resetOtpFailures();
        setSmsCooldownSec(0);
        setPendingPhoneOtp(null);
        await cleanupPhoneSession();
        setAuthModalOpen(false);
        return true;
      } catch (error: unknown) {
        const failure = recordOtpVerificationFailure();
        if (failure.locked) {
          setSmsCooldownSec(failure.waitSec);
          setPendingPhoneOtp(null);
          await cleanupPhoneSession();
          setAuthError(
            'Trop de codes erronés (5 tentatives). Par sécurité, patientez 5 minutes avant de demander un nouveau SMS.',
          );
        } else {
          setAuthError(translatePhoneAuthError(error));
        }
        return false;
      }
    },
    [cleanupPhoneSession, pendingPhoneOtp],
  );

  const sendAdditionalPhoneOtp = useCallback(
    async (rawPhone: string, recaptchaContainer: HTMLElement): Promise<boolean> => {
      if (!user) return false;
      setAuthError(null);
      setPhoneProviderSetupHint(false);

      const e164 = normalizeE164Phone(rawPhone);
      const analysis = analyzePhoneNumber(e164);
      if (!analysis.isValid) {
        setAuthError(analysis.error || 'Numéro de téléphone invalide.');
        return false;
      }

      if (verifiedPhones.includes(e164) || user.phoneNumber === e164) {
        setAuthError('Ce numéro vérifié est déjà associé à votre compte GidaColocs.');
        return false;
      }

      if (verifiedPhones.length >= 5) {
        setAuthError('Limite atteinte : 5 numéros vérifiés maximum par compte.');
        return false;
      }

      const guard = canSendSmsOtp();
      if (!guard.allowed) {
        setSmsCooldownSec(guard.waitSec);
        setAuthError(guard.reason || 'Patientez avant de demander un code SMS.');
        return false;
      }

      await cleanupPhoneSession();

      try {
        recaptchaContainer.innerHTML = '';
        const hasPrimaryPhone =
          Boolean(user.phoneNumber) ||
          user.providerData.some((provider) => provider.providerId === 'phone');

        let confirmation: ConfirmationResult;
        if (!hasPrimaryPhone) {
          linkUsesPrimaryProviderRef.current = true;
          const verifier = new RecaptchaVerifier(auth, recaptchaContainer, {
            size: 'invisible',
          });
          recaptchaVerifierRef.current = verifier;
          confirmation = await linkWithPhoneNumber(user, e164, verifier);
        } else {
          linkUsesPrimaryProviderRef.current = false;
          const secApp = initializeApp(auth.app.options, `qolock_phone_verify_${Date.now()}`);
          secondaryAppRef.current = secApp;
          const secAuth = getAuth(secApp);
          secAuth.languageCode = 'fr';
          const verifier = new RecaptchaVerifier(secAuth, recaptchaContainer, {
            size: 'invisible',
          });
          recaptchaVerifierRef.current = verifier;
          confirmation = await signInWithPhoneNumber(secAuth, e164, verifier);
        }

        confirmationResultRef.current = confirmation;
        recordSmsSent();
        setSmsCooldownSec(getSmsCooldownRemainingSec());
        setPendingPhoneOtp({
          e164,
          operatorLabel: analysis.operatorLabel,
          countryLabel: analysis.countryLabel,
          mode: 'link',
        });
        return true;
      } catch (error: unknown) {
        await cleanupPhoneSession();
        const code = getFirebaseAuthErrorCode(error);
        if (code === 'auth/operation-not-allowed' || code === 'auth/quota-exceeded') {
          setPhoneProviderSetupHint(true);
        }
        setAuthError(translatePhoneAuthError(error));
        return false;
      }
    },
    [cleanupPhoneSession, user, verifiedPhones],
  );

  const confirmAdditionalPhoneOtp = useCallback(
    async (code: string): Promise<boolean> => {
      if (!user) return false;
      setAuthError(null);

      const confirmation = confirmationResultRef.current;
      const pending = pendingPhoneOtp;
      if (!confirmation || !pending || pending.mode !== 'link') {
        setAuthError('Aucune vérification de numéro supplémentaire en cours.');
        return false;
      }

      const cleanCode = code.replace(/\D/g, '');
      if (cleanCode.length !== 6) {
        setAuthError('Saisissez les 6 chiffres du code reçu par SMS.');
        return false;
      }

      try {
        await confirmation.confirm(cleanCode);
        const cleanPhone = sanitizeText(pending.e164, BLUEPRINT_LIMITS.PHONE_MAX);
        const nextList = Array.from(new Set([...verifiedPhones, cleanPhone])).slice(0, 5);
        const cleanEmail = isSyntheticWhatsAppEmail(user.email)
          ? ''
          : sanitizeText((user.email || '').toLowerCase(), BLUEPRINT_LIMITS.EMAIL_MAX);
        const primaryPhone = sanitizeText(privatePhone || cleanPhone, BLUEPRINT_LIMITS.PHONE_MAX);

        await setDoc(
          doc(db, 'users', user.uid, 'private', 'info'),
          {
            email: cleanEmail,
            phone: primaryPhone,
            verifiedPhones: nextList,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        setVerifiedPhones(nextList);
        if (!privatePhone) {
          setPrivatePhone(primaryPhone);
        }
        resetOtpFailures();
        setSmsCooldownSec(0);
        setPendingPhoneOtp(null);
        await cleanupPhoneSession();
        return true;
      } catch (error: unknown) {
        const failure = recordOtpVerificationFailure();
        if (failure.locked) {
          setSmsCooldownSec(failure.waitSec);
          setPendingPhoneOtp(null);
          await cleanupPhoneSession();
          setAuthError(
            'Trop de codes erronés. Par sécurité, patientez 5 minutes avant de réessayer.',
          );
        } else {
          setAuthError(translatePhoneAuthError(error));
        }
        return false;
      }
    },
    [cleanupPhoneSession, pendingPhoneOtp, privatePhone, user, verifiedPhones],
  );

  const removeVerifiedPhone = useCallback(
    async (e164: string): Promise<boolean> => {
      if (!user) return false;
      if (user.phoneNumber === e164) {
        setAuthError(
          'Votre numéro principal de connexion Firebase ne peut pas être supprimé depuis cette liste.',
        );
        return false;
      }
      const nextList = verifiedPhones.filter((item) => item !== e164);
      const cleanEmail = isSyntheticWhatsAppEmail(user.email)
        ? ''
        : sanitizeText((user.email || '').toLowerCase(), BLUEPRINT_LIMITS.EMAIL_MAX);
      const cleanPhone = sanitizeText(privatePhone, BLUEPRINT_LIMITS.PHONE_MAX);

      try {
        await setDoc(
          doc(db, 'users', user.uid, 'private', 'info'),
          {
            email: cleanEmail,
            phone: cleanPhone,
            verifiedPhones: nextList,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setVerifiedPhones(nextList);
        return true;
      } catch {
        setAuthError('Impossible de retirer ce numéro pour le moment.');
        return false;
      }
    },
    [privatePhone, user, verifiedPhones],
  );

  const saveWhatsAppNumber = useCallback(
    async (rawPhone: string): Promise<boolean> => {
      if (!user) return false;
      const e164 = normalizeE164Phone(rawPhone);
      if (!/^\+[1-9]\d{6,14}$/.test(e164)) {
        return false;
      }
      const cleanEmail = isSyntheticWhatsAppEmail(user.email)
        ? ''
        : sanitizeText((user.email || '').toLowerCase(), BLUEPRINT_LIMITS.EMAIL_MAX);
      const cleanPhone = sanitizeText(e164, BLUEPRINT_LIMITS.PHONE_MAX);
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'private', 'info'),
          {
            email: cleanEmail,
            phone: cleanPhone,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setPrivatePhone(cleanPhone);
        return true;
      } catch {
        return false;
      }
    },
    [user],
  );

  const signOutUser = useCallback(async () => {
    await cleanupPhoneSession();
    await signOut(auth);
    setProfile(null);
    setPrivatePhone('');
    setVerifiedPhones([]);
    setPendingPhoneOtp(null);
    setIsVerifiedOwner(false);
    setAdminDocExists(false);
    setAuthError(null);
    setWhatsappProviderSetupHint(false);
    setPhoneProviderSetupHint(false);
  }, [cleanupPhoneSession]);

  const updateLocalProfile = useCallback((patch: Partial<UserProfile>, phone?: string) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    if (typeof phone === 'string') {
      setPrivatePhone(phone);
    }
  }, []);

  const isAdmin = Boolean(
    user && (isVerifiedOwner || adminDocExists),
  );
  const hasPasswordAdminLinked = Boolean(
    user && user.providerData.some((p) => p?.providerId === 'password'),
  );
  const adminUidMissingDoc = Boolean(
    user &&
      !isAdmin &&
      (user.email?.toLowerCase() === RESERVED_ADMIN_AUTH_EMAIL ||
        normalizeE164Phone(privatePhone) === RESERVED_ADMIN_PHONE),
  );
  const isSuspended = Boolean(profile?.accountStatus === 'suspended' && !isAdmin);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        privatePhone,
        verifiedPhones,
        isAdmin,
        isVerifiedOwner,
        hasPasswordAdminLinked,
        adminUidMissingDoc,
        isSuspended,
        authReady,
        authError,
        authModalOpen,
        whatsappProviderSetupHint,
        phoneProviderSetupHint,
        smsCooldownSec,
        pendingPhoneOtp,
        openAuthModal,
        closeAuthModal,
        theme,
        toggleTheme,
        signInWithGoogle,
        signInWithGoogleSelectAccount,
        signInWithWhatsApp,
        signInAdminWithPhonePassword,
        configureAdminAccessCode,
        listAdminRegistry,
        sendPhoneOtp,
        confirmPhoneOtp,
        sendAdditionalPhoneOtp,
        confirmAdditionalPhoneOtp,
        cancelPhoneOtp,
        removeVerifiedPhone,
        saveWhatsAppNumber,
        clearAuthError,
        signOutUser,
        updateLocalProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
