export interface PhoneAnalysis {
  e164: string;
  isValid: boolean;
  countryCode: 'NE' | 'BJ' | 'OTHER';
  countryLabel: string;
  operatorKey: 'airtel' | 'moov' | 'mtn' | 'niger_telecoms' | 'other';
  operatorLabel: string;
  smsCompatibilityNote: string;
  error?: string;
}

const SMS_STORAGE_KEY = 'qolock_sms_rate_limit_v1';
const SMS_RESEND_COOLDOWN_MS = 60_000;
const SMS_WINDOW_MS = 15 * 60_000;
const MAX_SMS_PER_WINDOW = 5;
const MAX_OTP_FAILURES = 5;

interface SmsRateState {
  timestamps: number[];
  lastSentAt: number;
  failedAttempts: number;
  lockedUntil: number;
}

function readRateState(): SmsRateState {
  if (typeof window === 'undefined') {
    return { timestamps: [], lastSentAt: 0, failedAttempts: 0, lockedUntil: 0 };
  }
  try {
    const raw = window.localStorage.getItem(SMS_STORAGE_KEY);
    if (!raw) return { timestamps: [], lastSentAt: 0, failedAttempts: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<SmsRateState>;
    const now = Date.now();
    return {
      timestamps: Array.isArray(parsed.timestamps)
        ? parsed.timestamps.filter((t) => typeof t === 'number' && now - t < SMS_WINDOW_MS)
        : [],
      lastSentAt: typeof parsed.lastSentAt === 'number' ? parsed.lastSentAt : 0,
      failedAttempts: typeof parsed.failedAttempts === 'number' ? parsed.failedAttempts : 0,
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
    };
  } catch {
    return { timestamps: [], lastSentAt: 0, failedAttempts: 0, lockedUntil: 0 };
  }
}

function writeRateState(state: SmsRateState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SMS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues
  }
}

export function getSmsCooldownRemainingSec(): number {
  const now = Date.now();
  const state = readRateState();
  const lockRem = state.lockedUntil > now ? state.lockedUntil - now : 0;
  const resendRem =
    state.lastSentAt > 0 && now - state.lastSentAt < SMS_RESEND_COOLDOWN_MS
      ? SMS_RESEND_COOLDOWN_MS - (now - state.lastSentAt)
      : 0;
  return Math.ceil(Math.max(lockRem, resendRem) / 1000);
}

export function canSendSmsOtp(): { allowed: boolean; waitSec: number; reason?: string } {
  const now = Date.now();
  const state = readRateState();
  if (state.lockedUntil > now) {
    const waitSec = Math.ceil((state.lockedUntil - now) / 1000);
    return {
      allowed: false,
      waitSec,
      reason: `Protection anti-abus active. Patientez ${waitSec}s avant de demander un nouveau code SMS.`,
    };
  }
  if (state.lastSentAt > 0 && now - state.lastSentAt < SMS_RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((SMS_RESEND_COOLDOWN_MS - (now - state.lastSentAt)) / 1000);
    return {
      allowed: false,
      waitSec,
      reason: `Veuillez patienter ${waitSec}s avant de renvoyer un code SMS.`,
    };
  }
  if (state.timestamps.length >= MAX_SMS_PER_WINDOW) {
    const oldest = state.timestamps[0];
    const waitSec = Math.max(60, Math.ceil((SMS_WINDOW_MS - (now - oldest)) / 1000));
    state.lockedUntil = now + waitSec * 1000;
    writeRateState(state);
    return {
      allowed: false,
      waitSec,
      reason: 'Trop de demandes de SMS en peu de temps. Réessayez dans quelques minutes.',
    };
  }
  return { allowed: true, waitSec: 0 };
}

export function recordSmsSent(): void {
  const now = Date.now();
  const state = readRateState();
  state.timestamps.push(now);
  state.lastSentAt = now;
  state.failedAttempts = 0;
  writeRateState(state);
}

export function recordOtpVerificationFailure(): { locked: boolean; waitSec: number } {
  const now = Date.now();
  const state = readRateState();
  state.failedAttempts += 1;
  if (state.failedAttempts >= MAX_OTP_FAILURES) {
    state.lockedUntil = now + 5 * 60_000;
    state.failedAttempts = 0;
    writeRateState(state);
    return { locked: true, waitSec: 300 };
  }
  writeRateState(state);
  return { locked: false, waitSec: 0 };
}

export function resetOtpFailures(): void {
  const state = readRateState();
  state.failedAttempts = 0;
  state.lockedUntil = 0;
  writeRateState(state);
}

export function normalizeE164Phone(rawInput: string, defaultPrefix = '+227'): string {
  let cleaned = rawInput.trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }
  if (cleaned.startsWith('+')) {
    return `+${cleaned.slice(1).replace(/[^0-9]/g, '')}`;
  }
  const digits = cleaned.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('227') && digits.length >= 11) {
    return `+${digits}`;
  }
  if (digits.startsWith('229') && digits.length >= 11) {
    return `+${digits}`;
  }
  const prefixDigits = defaultPrefix.replace(/[^0-9]/g, '') || '227';
  return `+${prefixDigits}${digits}`;
}

export function combinePrefixAndLocalPhone(countryPrefix: string, localPhone: string): string {
  const trimmed = localPhone.trim();
  if (!trimmed) return '';
  const compact = trimmed.replace(/[\s\-().]/g, '');
  if (compact.startsWith('+')) {
    return `+${compact.slice(1).replace(/[^0-9]/g, '')}`;
  }
  if (compact.startsWith('00')) {
    return `+${compact.slice(2).replace(/[^0-9]/g, '')}`;
  }
  const digits = compact.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (countryPrefix === '+') {
    return `+${digits}`;
  }
  const prefixDigits = countryPrefix.replace(/[^0-9]/g, '');
  if (
    (digits.startsWith('227') && digits.length >= 11) ||
    (digits.startsWith('229') && digits.length >= 11) ||
    (prefixDigits && digits.startsWith(prefixDigits) && digits.length >= prefixDigits.length + 8)
  ) {
    return `+${digits}`;
  }
  return `${countryPrefix}${digits}`;
}

export function analyzePhoneNumber(e164: string): PhoneAnalysis {
  if (!e164 || !/^\+[1-9]\d{6,14}$/.test(e164)) {
    return {
      e164,
      isValid: false,
      countryCode: 'OTHER',
      countryLabel: 'International',
      operatorKey: 'other',
      operatorLabel: 'Format invalide',
      smsCompatibilityNote: '',
      error: 'Format international invalide. Saisissez votre numéro valide selon le pays sélectionné (ex. 70000000).',
    };
  }

  // Niger (+227): 8 chiffres locaux
  if (e164.startsWith('+227')) {
    const local = e164.slice(4);
    if (!/^\d{8}$/.test(local)) {
      return {
        e164,
        isValid: false,
        countryCode: 'NE',
        countryLabel: 'Niger (+227)',
        operatorKey: 'other',
        operatorLabel: 'Niger (+227)',
        smsCompatibilityNote: '',
        error: 'Un numéro du Niger (+227) doit contenir exactement 8 chiffres après +227.',
      };
    }
    const p2 = local.slice(0, 2);
    let operatorKey: PhoneAnalysis['operatorKey'] = 'other';
    let operatorLabel = 'Opérateur Niger (+227)';

    if (['96', '97', '98', '99', '88', '89', '74', '76', '77'].includes(p2)) {
      operatorKey = 'airtel';
      operatorLabel = 'Airtel Niger';
    } else if (['94', '95', '84', '85', '70', '71'].includes(p2)) {
      operatorKey = 'moov';
      operatorLabel = 'Moov Africa Niger';
    } else if (['90', '91', '92', '93', '80', '81', '82', '83', '20', '21'].includes(p2)) {
      operatorKey = 'niger_telecoms';
      operatorLabel = 'Niger Telecoms / Zamani';
    }

    return {
      e164,
      isValid: true,
      countryCode: 'NE',
      countryLabel: 'Niger (+227)',
      operatorKey,
      operatorLabel,
      smsCompatibilityNote:
        'Compatible avec les opérateurs du Niger (+227) : Airtel Niger, Moov Africa et Niger Telecoms.',
    };
  }

  // Bénin (+229): nouveau plan à 10 chiffres commençant par 01
  if (e164.startsWith('+229')) {
    const local = e164.slice(4);
    if (/^\d{8}$/.test(local)) {
      return {
        e164,
        isValid: false,
        countryCode: 'BJ',
        countryLabel: 'Bénin (+229)',
        operatorKey: 'other',
        operatorLabel: 'Bénin (+229)',
        smsCompatibilityNote: '',
        error: 'Pour le Bénin (+229), utilisez le format officiel à 10 chiffres commençant par 01.',
      };
    }
    if (!/^01\d{8}$/.test(local)) {
      return {
        e164,
        isValid: false,
        countryCode: 'BJ',
        countryLabel: 'Bénin (+229)',
        operatorKey: 'other',
        operatorLabel: 'Bénin (+229)',
        smsCompatibilityNote: '',
        error: 'Un numéro du Bénin (+229) doit contenir 10 chiffres après +229 et commencer par 01.',
      };
    }
    const p4 = local.slice(0, 4);
    const p4Num = Number(p4);
    let operatorKey: PhoneAnalysis['operatorKey'] = 'other';
    let operatorLabel = 'MTN / Moov Bénin';

    if (
      ['0160', '0164', '0165', '0168', '0194', '0195', '0198', '0199', '0145'].includes(p4)
    ) {
      operatorKey = 'moov';
      operatorLabel = 'Moov Africa Bénin';
    } else if (
      (p4Num >= 150 && p4Num <= 159) ||
      ['0140', '0141', '0142', '0143', '0144', '0146', '0147', '0161', '0162', '0163', '0166', '0167', '0169', '0190', '0191', '0192', '0193', '0196', '0197'].includes(p4)
    ) {
      operatorKey = 'mtn';
      operatorLabel = 'MTN Bénin';
    }

    return {
      e164,
      isValid: true,
      countryCode: 'BJ',
      countryLabel: 'Bénin (+229)',
      operatorKey,
      operatorLabel,
      smsCompatibilityNote:
        'Compatible avec MTN Bénin et Moov Africa Bénin (+229, format officiel à 10 chiffres commençant par 01).',
    };
  }

  return {
    e164,
    isValid: true,
    countryCode: 'OTHER',
    countryLabel: 'International',
    operatorKey: 'other',
    operatorLabel: 'Opérateur international',
    smsCompatibilityNote:
      'Compatible avec la vérification SMS selon la couverture de votre opérateur mobile.',
  };
}

export function translatePhoneAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code || '')
      : '';

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'L’envoi de SMS est momentanément indisponible pour cet indicatif. Connectez-vous avec votre code WhatsApp simple ou Google ci-dessous.';
    case 'auth/quota-exceeded':
      return 'La limite temporaire d’envoi de SMS est atteinte pour le moment. Utilisez votre code WhatsApp simple ou Google pour accéder à votre compte.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives détectées. Patientez quelques minutes ou utilisez votre code WhatsApp simple.';
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
    case 'auth/missing-app-credential':
      return 'La vérification de sécurité automatique n’a pas abouti. Réessayez ou utilisez WhatsApp + code simple / Google.';
    case 'auth/invalid-phone-number':
      return 'Ce numéro de téléphone n’est pas reconnu au format international (+227 ou +229).';
    case 'auth/invalid-verification-code':
      return 'Code incorrect. Vérifiez les 6 chiffres saisis.';
    case 'auth/code-expired':
      return 'Ce code a expiré. Demandez un nouveau code.';
    case 'auth/credential-already-in-use':
      return 'Ce numéro de téléphone est déjà associé à un autre compte GidaColocs.';
    case 'auth/provider-already-linked':
      return 'Un numéro principal est déjà lié à ce compte.';
    case 'auth/requires-recent-login':
      return 'Par sécurité, déconnectez-vous puis reconnectez-vous avant d’associer un nouveau numéro.';
    case 'auth/network-request-failed':
      return 'Réseau Internet indisponible. Vérifiez votre connexion et réessayez.';
    case 'auth/user-disabled':
      return 'Ce compte a été désactivé par l’administration GidaColocs.';
    default:
      return error instanceof Error
        ? error.message
        : 'Impossible de finaliser la vérification pour le moment.';
  }
}
