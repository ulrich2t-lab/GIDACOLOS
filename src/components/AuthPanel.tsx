import React, { useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Lock,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserPlus,
} from 'lucide-react';
import { DEFAULT_PLATFORM_CONFIG, RESERVED_ADMIN_PHONE } from '../lib/constants';
import { buildWhatsAppUrl } from '../lib/formatters';
import { analyzePhoneNumber, combinePrefixAndLocalPhone } from '../lib/phoneAuthUtils';
import { normalizeE164Phone, useAuth } from '../context/AuthContext';
import type { AccountType } from '../types/platform';

const COUNTRY_PREFIXES = [
  { code: '+227', label: 'Niger (+227)' },
  { code: '+229', label: 'Bénin (+229)' },
  { code: '+', label: 'Autre indicatif' },
] as const;

function generateSixDigitWhatsAppCode(): string {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    return String(100000 + (arr[0] % 900000));
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

interface AuthPanelProps {
  defaultAccountType?: AccountType;
  whatsappSupportPrimary?: string;
  onAuthenticated?: () => void;
}

export function AuthPanel({
  defaultAccountType = 'tenant',
  whatsappSupportPrimary = DEFAULT_PLATFORM_CONFIG.whatsappNumber,
  onAuthenticated,
}: AuthPanelProps) {
  const {
    authError,
    whatsappProviderSetupHint,
    phoneProviderSetupHint,
    smsCooldownSec,
    pendingPhoneOtp,
    clearAuthError,
    signInWithWhatsApp,
    signInWithGoogle,
    sendPhoneOtp,
    confirmPhoneOtp,
    cancelPhoneOtp,
  } = useAuth();

  // Primary flow: WhatsApp + Simple Code before connection
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [waStep, setWaStep] = useState<'phone' | 'verify'>('phone');
  const [countryPrefix, setCountryPrefix] = useState<string>('+227');
  const [localPhone, setLocalPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>(defaultAccountType);

  // Simple pre-login WhatsApp confirmation code (6 digits) + user's simple personal access code
  const [issuedWaCode, setIssuedWaCode] = useState('');
  const [enteredWaCode, setEnteredWaCode] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [showCode, setShowCode] = useState(false);

  // Discreet legacy SMS fallback for accounts originally created via Firebase SMS
  const [showLegacySmsFallback, setShowLegacySmsFallback] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const recaptchaId = useId();
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  const resetErrors = () => {
    setLocalError(null);
    clearAuthError();
  };

  const combinedPhone = combinePrefixAndLocalPhone(countryPrefix, localPhone);
  const formattedCandidate = normalizeE164Phone(
    combinedPhone,
    countryPrefix === '+' ? '+227' : countryPrefix,
  );
  const phoneAnalysis = formattedCandidate ? analyzePhoneNumber(formattedCandidate) : null;

  const handleRequestWhatsAppCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    resetErrors();

    if (!/^\+[1-9]\d{6,14}$/.test(formattedCandidate)) {
      setLocalError(
        'Numéro WhatsApp invalide. Saisissez votre numéro valide selon le pays sélectionné (ex. 70000000).',
      );
      return;
    }

    if (phoneAnalysis && !phoneAnalysis.isValid) {
      setLocalError(phoneAnalysis.error || 'Vérifiez le format du numéro saisi.');
      return;
    }

    if (mode === 'register' && formattedCandidate === RESERVED_ADMIN_PHONE) {
      setLocalError('Ce numéro ne peut pas être utilisé pour créer un compte membre.');
      return;
    }

    if (mode === 'register' && fullName.trim().length < 2) {
      setLocalError('Indiquez votre nom complet avant de recevoir votre code WhatsApp.');
      return;
    }

    const nextCode = generateSixDigitWhatsAppCode();
    setIssuedWaCode(nextCode);
    setEnteredWaCode('');
    setWaStep('verify');
  };

  const handleRegenerateWaCode = () => {
    resetErrors();
    const nextCode = generateSixDigitWhatsAppCode();
    setIssuedWaCode(nextCode);
    setEnteredWaCode('');
  };

  const handleVerifyAndConnectWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    resetErrors();

    const cleanEnteredWa = enteredWaCode.replace(/\D/g, '');
    if (cleanEnteredWa !== issuedWaCode) {
      setLocalError(
        'Le code WhatsApp saisi ne correspond pas. Recopiez les 6 chiffres affichés dans votre carte WhatsApp.',
      );
      return;
    }

    if (mode === 'register' && formattedCandidate === RESERVED_ADMIN_PHONE) {
      setLocalError('Ce numéro ne peut pas être utilisé pour créer un compte membre.');
      return;
    }

    if (secretCode.trim().length < 6) {
      setLocalError(
        'Votre code d’accès personnel doit contenir au moins 6 caractères ou chiffres.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const ok = await signInWithWhatsApp({
        rawPhone: formattedCandidate,
        secretCode,
        mode,
        fullName,
        accountType,
      });
      if (ok) {
        onAuthenticated?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendLegacySmsOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    resetErrors();

    if (!formattedCandidate || !phoneAnalysis?.isValid) {
      setLocalError(
        phoneAnalysis?.error ||
          'Saisissez un numéro valide avec indicatif international (+227 ou +229).',
      );
      return;
    }

    if (!recaptchaContainerRef.current) {
      setLocalError('Module de sécurité en cours de chargement. Réessayez.');
      return;
    }

    setSubmitting(true);
    try {
      const ok = await sendPhoneOtp({
        rawPhone: formattedCandidate,
        recaptchaContainer: recaptchaContainerRef.current,
        fullName: fullName.trim() || undefined,
        accountType,
      });
      if (ok) {
        setOtpCode('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmLegacySmsOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    resetErrors();

    setSubmitting(true);
    try {
      const ok = await confirmPhoneOtp(otpCode);
      if (ok) {
        setOtpCode('');
        setShowLegacySmsFallback(false);
        onAuthenticated?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendLegacySmsOtp = async () => {
    if (submitting || smsCooldownSec > 0 || !recaptchaContainerRef.current || !pendingPhoneOtp) {
      return;
    }
    resetErrors();
    setSubmitting(true);
    try {
      await sendPhoneOtp({
        rawPhone: pendingPhoneOtp.e164,
        recaptchaContainer: recaptchaContainerRef.current,
        fullName: fullName.trim() || undefined,
        accountType,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleQuick = async () => {
    if (submitting) return;
    resetErrors();
    setSubmitting(true);
    try {
      const ok = await signInWithGoogle(combinedPhone, accountType);
      if (ok) {
        onAuthenticated?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const helpMessage = formattedCandidate
    ? `Bonjour GidaColocs, j’ai besoin d’aide pour accéder ou récupérer mon compte avec le numéro (${formattedCandidate}).`
    : 'Bonjour GidaColocs, j’ai besoin d’aide pour accéder à mon compte.';
  const supportUrl = buildWhatsAppUrl(whatsappSupportPrimary, helpMessage);

  const whatsappVerificationActionUrl = buildWhatsAppUrl(
    whatsappSupportPrimary,
    `Bonjour GidaColocs, je confirme mon numéro WhatsApp (${formattedCandidate}) avant connexion avec le code : ${issuedWaCode}`,
  );

  const displayedError = localError || authError;

  return (
    <div className="space-y-4">
      {displayedError && (
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300 space-y-2">
          <p className="font-semibold leading-relaxed">{displayedError}</p>
          {(whatsappProviderSetupHint || phoneProviderSetupHint) && (
            <div className="pt-2 border-t border-red-200/70 dark:border-red-900/50 text-xs font-medium text-red-800 dark:text-red-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Astuce : vous pouvez vous connecter immédiatement en 1 clic via{' '}
                <strong>Continuer avec Google</strong> ci-dessous.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Invisible reCAPTCHA only used if user explicitly triggers legacy SMS recovery */}
      <div id={`recaptcha-${recaptchaId}`} ref={recaptchaContainerRef} className="hidden" />

      {showLegacySmsFallback ? (
        <div className="space-y-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1437]/80">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-[#0B1437] dark:text-white inline-flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Récupération ancien compte SMS</span>
            </p>
            <button
              type="button"
              onClick={() => {
                resetErrors();
                cancelPhoneOtp();
                setShowLegacySmsFallback(false);
              }}
              className="min-h-[36px] px-2 text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
            >
              ← Retour WhatsApp
            </button>
          </div>

          {pendingPhoneOtp?.mode === 'signin' ? (
            <form onSubmit={handleConfirmLegacySmsOtp} className="space-y-3.5">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                Code SMS envoyé au <strong>{pendingPhoneOtp.e164}</strong> ({pendingPhoneOtp.operatorLabel}).
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => {
                  resetErrors();
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                placeholder="123456"
                className="w-full min-h-[48px] px-4 py-2 text-lg font-extrabold text-center tracking-[0.35em] tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              />
              <button
                type="submit"
                disabled={submitting || otpCode.length !== 6}
                className="w-full min-h-[46px] py-2.5 px-4 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-[#93A3FF] dark:text-[#0B1437] dark:hover:bg-[#A6B3FF] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
              >
                {submitting ? 'Vérification...' : 'Valider le code SMS'}
              </button>
              <div className="flex items-center justify-between text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    resetErrors();
                    cancelPhoneOtp();
                    setOtpCode('');
                  }}
                  className="text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                >
                  Changer de numéro
                </button>
                <button
                  type="button"
                  disabled={submitting || smsCooldownSec > 0}
                  onClick={handleResendLegacySmsOtp}
                  className="text-teal-700 dark:text-teal-300 disabled:text-slate-400 cursor-pointer tabular-nums"
                >
                  {smsCooldownSec > 0 ? `Renvoyer (${smsCooldownSec}s)` : 'Renvoyer le code'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSendLegacySmsOtp} className="space-y-3.5">
              <div className="flex gap-2">
                <select
                  value={countryPrefix}
                  onChange={(e) => {
                    resetErrors();
                    setCountryPrefix(e.target.value);
                  }}
                  aria-label="Indicatif pays"
                  className="min-h-[46px] px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-white shrink-0 focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                >
                  {COUNTRY_PREFIXES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  required
                  value={localPhone}
                  onChange={(e) => {
                    resetErrors();
                    setLocalPhone(e.target.value);
                  }}
                  placeholder="70000000"
                  className="flex-1 min-w-0 min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || smsCooldownSec > 0}
                className="w-full min-h-[46px] py-2.5 px-4 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-[#93A3FF] dark:text-[#0B1437] dark:hover:bg-[#A6B3FF] disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
              >
                {submitting ? 'Envoi...' : 'Recevoir mon code SMS'}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Primary Mode Switch: Connexion vs Inscription (WhatsApp + Simple Code before connection) */}
          <div
            role="tablist"
            aria-label="Mode de connexion WhatsApp"
            className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100 dark:bg-[#0B1437] border border-slate-200/80 dark:border-slate-800 rounded-xl"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                resetErrors();
                setMode('login');
                setWaStep('phone');
              }}
              className={`min-h-[44px] px-3 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-[#1E293B] text-[#0B1437] dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Me connecter
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                resetErrors();
                setMode('register');
                setWaStep('phone');
              }}
              className={`min-h-[44px] px-3 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-white dark:bg-[#1E293B] text-[#0B1437] dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Créer mon compte
            </button>
          </div>

          {waStep === 'phone' ? (
            <form onSubmit={handleRequestWhatsAppCode} className="space-y-4">
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Numéro WhatsApp (Airtel, MTN, Moov ou autre)
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryPrefix}
                    onChange={(e) => {
                      resetErrors();
                      setCountryPrefix(e.target.value);
                    }}
                    aria-label="Indicatif pays"
                    className="min-h-[46px] px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1437]/80 text-slate-900 dark:text-white shrink-0 focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                  >
                    {COUNTRY_PREFIXES.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    value={localPhone}
                    onChange={(e) => {
                      resetErrors();
                      setLocalPhone(e.target.value);
                    }}
                    placeholder="70000000"
                    className="flex-1 min-w-0 min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                  />
                </div>

                {phoneAnalysis && localPhone.trim().length >= 4 && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${
                        phoneAnalysis.isValid
                          ? 'text-teal-700 dark:text-teal-300'
                          : 'text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {phoneAnalysis.isValid
                          ? `${phoneAnalysis.operatorLabel} · ${phoneAnalysis.e164}`
                          : phoneAnalysis.error}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {mode === 'register' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                      Nom complet
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => {
                        resetErrors();
                        setFullName(e.target.value);
                      }}
                      placeholder="Ex. Ibrahim Moussa"
                      className="w-full min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                      Votre profil
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as AccountType)}
                      className="w-full min-h-[46px] px-3.5 py-2 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                    >
                      <option value="tenant">Étudiant / Locataire</option>
                      <option value="landlord">Propriétaire / Démarcheur</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 py-2.5 px-4 text-[15px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-[#060B1D] dark:hover:bg-emerald-400 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Obtenir mon code WhatsApp</span>
              </button>

              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                Un code WhatsApp simple de vérification s’affiche à l’étape suivante avant
                d’ouvrir votre session GidaColocs — sans attente SMS ni frais opérateur.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndConnectWhatsApp} className="space-y-4">
              {/* Step 2: Simple WhatsApp Verification Code before connection */}
              <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/35 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Code WhatsApp généré</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                    {formattedCandidate}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#0B1437] border border-emerald-200/80 dark:border-emerald-800/60">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                      Code à recopier avant connexion
                    </p>
                    <p className="text-2xl font-extrabold tracking-[0.28em] text-[#0B1437] dark:text-white tabular-nums mt-0.5">
                      {issuedWaCode}
                    </p>
                  </div>
                  <a
                    href={whatsappVerificationActionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/60 hover:bg-emerald-200 dark:hover:bg-emerald-900 rounded-xl shrink-0 whitespace-nowrap"
                  >
                    <span>Ouvrir WhatsApp</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`wa-code-${recaptchaId}`}
                  className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  1. Saisissez le code WhatsApp (6 chiffres)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id={`wa-code-${recaptchaId}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    value={enteredWaCode}
                    onChange={(e) => {
                      resetErrors();
                      setEnteredWaCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                    placeholder="123456"
                    className="w-full min-h-[48px] pl-10 pr-4 py-2 text-base font-extrabold tracking-[0.28em] tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  {mode === 'register'
                    ? '2. Choisissez votre code d’accès personnel (min. 6 caractères)'
                    : '2. Votre code d’accès personnel GidaColocs'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showCode ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={64}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={secretCode}
                    onChange={(e) => {
                      resetErrors();
                      setSecretCode(e.target.value);
                    }}
                    placeholder="••••••"
                    className="w-full min-h-[46px] pl-10 pr-11 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCode((v) => !v)}
                    aria-label={showCode ? 'Masquer le code' : 'Afficher le code'}
                    className="min-w-[38px] min-h-[38px] flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer rounded-lg"
                  >
                    {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || enteredWaCode.length !== 6}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 py-2.5 px-4 text-[15px] font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-[#93A3FF] dark:text-[#0B1437] dark:hover:bg-[#A6B3FF] disabled:opacity-60 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                {mode === 'register' ? (
                  <>
                    <UserPlus className="w-4 h-4 shrink-0" />
                    <span>
                      {submitting ? 'Création en cours...' : 'Valider et créer mon compte'}
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>{submitting ? 'Connexion...' : 'Valider et me connecter'}</span>
                  </>
                )}
              </button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    resetErrors();
                    setWaStep('phone');
                    setEnteredWaCode('');
                  }}
                  className="min-h-[36px] inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Changer de numéro</span>
                </button>

                <button
                  type="button"
                  onClick={handleRegenerateWaCode}
                  className="min-h-[36px] inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Nouveau code WhatsApp</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
        <span className="shrink-0 mx-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          ou connexion express 1 clic
        </span>
        <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
      </div>

      {/* Google Express Sign-In (binds entered phone number automatically) */}
      <button
        type="button"
        disabled={submitting}
        onClick={handleGoogleQuick}
        className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-[#0B1437]/80 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
          />
        </svg>
        <span>Continuer avec Google (Instantané)</span>
      </button>

      {/* Account Recovery & Support Footer */}
      <div className="pt-1 space-y-2.5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setShowRecoveryHelp((v) => !v)}
            className="min-h-[36px] inline-flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>Récupération d’accès</span>
          </button>
          <a
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[36px] inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 hover:underline whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>Aide connexion sur WhatsApp</span>
          </a>
        </div>

        {showRecoveryHelp && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B1437]/80 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
            <p className="font-bold text-slate-800 dark:text-slate-100">
              Comment récupérer votre accès ?
            </p>
            <p>
              • <strong>Code WhatsApp :</strong> entrez votre numéro WhatsApp, recopiez le code
              affiché avant connexion puis saisissez votre code d’accès personnel.
            </p>
            <p>
              • <strong>Code oublié :</strong> contactez l’assistance GidaColocs sur WhatsApp pour
              vérifier votre identité.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Espace réservé aux membres GidaColocs.
              </span>
              {!showLegacySmsFallback && (
                <button
                  type="button"
                  onClick={() => {
                    resetErrors();
                    setShowLegacySmsFallback(true);
                  }}
                  className="text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
                >
                  Ancien compte SMS →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
