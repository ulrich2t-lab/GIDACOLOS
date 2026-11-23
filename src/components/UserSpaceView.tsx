import React, { useEffect, useState } from 'react';
import {
  Bell,
  BookmarkCheck,
  Check,
  CheckCheck,
  CheckCircle2,
  Coins,
  Download,
  Edit3,
  ImagePlus,
  LogOut,
  MessageCircle,
  Phone,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  getPaymentInstructionDetails,
  MARADI_NEIGHBORHOODS,
  OFFICIAL_WHATSAPP_GROUP_URL,
  PAYMENT_METHODS,
} from '../lib/constants';
import {
  ACCOUNT_TYPE_LABELS,
  buildWhatsAppUrl,
  COLOC_DESIRED_LABELS,
  CONTENT_MODERATION_LABELS,
  downloadPaymentReceipt,
  formatFcfa,
  formatTimestamp,
  LISTING_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
} from '../lib/formatters';
import { formatFirestoreErrorMessage } from '../lib/firestoreError';
import {
  deleteListingById,
  markAllNotificationsRead,
  markNotificationAsRead,
  submitServiceOrder,
  updateListingAvailabilityStatus,
  updateUserAccountSettings,
} from '../lib/qolockService';
import {
  BLUEPRINT_LIMITS,
  compressImageToDataUrl,
  normalizeTransactionRefKey,
} from '../lib/validation';
import { analyzePhoneNumber, combinePrefixAndLocalPhone } from '../lib/phoneAuthUtils';
import { isSyntheticWhatsAppEmail, normalizeE164Phone, useAuth } from '../context/AuthContext';
import { AuthPanel } from './AuthPanel';
import { Avatar } from './Avatar';
import type {
  AccountType,
  ColocProfile,
  Listing,
  PassAccess,
  PaymentMethod,
  PlatformConfig,
  RentalConfirmation,
  ServiceOrder,
  UserNotification,
} from '../types/platform';

interface UserSpaceViewProps {
  config: PlatformConfig;
  myListings: Listing[];
  myColocProfiles?: ColocProfile[];
  myOrders: ServiceOrder[];
  passAccessList: PassAccess[];
  notifications: UserNotification[];
  myRentalConfirmations?: RentalConfirmation[];
  onOpenRentalConfirmation?: (conf: RentalConfirmation) => void;
  onEditListing: (listing: Listing) => void;
  onSelectListing: (listing: Listing) => void;
  onGoToPublish: () => void;
}

export function UserSpaceView({
  config,
  myListings,
  myColocProfiles = [],
  myOrders,
  passAccessList,
  notifications,
  myRentalConfirmations = [],
  onOpenRentalConfirmation,
  onEditListing,
  onSelectListing,
  onGoToPublish,
}: UserSpaceViewProps) {
  const {
    user,
    profile,
    privatePhone,
    verifiedPhones,
    authError,
    smsCooldownSec,
    pendingPhoneOtp,
    clearAuthError,
    sendAdditionalPhoneOtp,
    confirmAdditionalPhoneOtp,
    cancelPhoneOtp,
    removeVerifiedPhone,
    signOutUser,
    updateLocalProfile,
  } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [accountType, setAccountType] = useState<AccountType>(profile?.accountType || 'tenant');
  const [neighborhood, setNeighborhood] = useState(profile?.neighborhood || '');
  const [phone, setPhone] = useState(privatePhone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [addPhonePrefix, setAddPhonePrefix] = useState('+227');
  const [addPhoneLocal, setAddPhoneLocal] = useState('');
  const [addPhoneOtp, setAddPhoneOtp] = useState('');
  const [addPhoneBusy, setAddPhoneBusy] = useState(false);
  const [addPhoneFeedback, setAddPhoneFeedback] = useState<string | null>(null);
  const [addPhoneError, setAddPhoneError] = useState<string | null>(null);
  const linkRecaptchaRef = React.useRef<HTMLDivElement | null>(null);

  const [topBoostListing, setTopBoostListing] = useState<Listing | null>(null);
  const [topPaymentMethod, setTopPaymentMethod] = useState<PaymentMethod>('Airtel Money');
  const [topRef, setTopRef] = useState('');
  const [topPhone, setTopPhone] = useState(privatePhone || '');
  const [topProofImage, setTopProofImage] = useState('');
  const [uploadingTopProof, setUploadingTopProof] = useState(false);
  const [submittingTop, setSubmittingTop] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [previewProofOrder, setPreviewProofOrder] = useState<ServiceOrder | null>(null);

  const [listingFilter, setListingFilter] = useState<
    | 'all'
    | 'pending'
    | 'in_review'
    | 'needs_correction'
    | 'published'
    | 'reserved'
    | 'rented'
    | 'rejected'
    | 'suspended'
  >('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [listingActionError, setListingActionError] = useState<string | null>(null);
  const [listingActionSuccess, setListingActionSuccess] = useState<string | null>(null);
  const [markingNotifs, setMarkingNotifs] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setAccountType(profile.accountType);
      setNeighborhood(profile.neighborhood);
    }
    setPhone(privatePhone || '');
    setTopPhone(privatePhone || '');
  }, [profile, privatePhone]);

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <h2 className="text-2xl font-bold text-[#0A2540] dark:text-white leading-tight">
            Accédez à votre espace personnel GidaColocs
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Connectez-vous avec votre numéro WhatsApp et un code simple, ou en 1 clic avec Google
            pour :
          </p>
          <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-800">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>Suivre vos Pass Visite et vos réservations de logement à Maradi.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>Publier et modifier vos chambres, annexes ou maisons à partager.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>Associer plusieurs numéros vérifiés et gérer vos annonces de colocation.</span>
            </li>
          </ul>
        </section>

        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Connexion utilisateur
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Numéro WhatsApp + code simple ou Google
            </p>
          </div>
          <AuthPanel whatsappSupportPrimary={config.whatsappNumber} />
        </section>
      </div>
    );
  }

  const actorName = profile?.displayName || user.displayName || 'Utilisateur';
  const topDurationDays = config.topListingDurationDays || 7;
  const activePassCount = passAccessList.filter((p) => p.listingId !== 'contract').length;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileFeedback(null);
    setProfileError(null);
    try {
      await updateUserAccountSettings(user, {
        displayName,
        accountType,
        neighborhood,
        phone,
      });
      updateLocalProfile({ displayName, accountType, neighborhood }, phone);
      setProfileFeedback('Profil mis à jour.');
    } catch (err) {
      setProfileError(formatFirestoreErrorMessage(err, 'Impossible de mettre à jour votre profil.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTopProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingTopProof(true);
    setTopError(null);
    try {
      const compressed = await compressImageToDataUrl(file, 960, 0.72);
      if (compressed.length > BLUEPRINT_LIMITS.PAYMENT_PROOF_MAX_LENGTH) {
        throw new Error('Capture trop lourde même après compression.');
      }
      setTopProofImage(compressed);
    } catch (err) {
      setTopError(
        err instanceof Error ? err.message : 'Impossible de traiter cette capture d’écran.',
      );
    } finally {
      setUploadingTopProof(false);
    }
  };

  const handleOrderTop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topBoostListing) return;
    const normRef = normalizeTransactionRefKey(topRef);
    const duplicateLocal = myOrders.find(
      (o) =>
        o.status !== 'rejected' &&
        o.status !== 'failed' &&
        normalizeTransactionRefKey(o.transactionRef) === normRef,
    );
    if (duplicateLocal) {
      setTopError('Cette référence de transaction a déjà été utilisée.');
      return;
    }

    const paymentDetails = getPaymentInstructionDetails(topPaymentMethod, config);
    setSubmittingTop(true);
    setTopError(null);
    setListingActionError(null);
    setListingActionSuccess(null);
    try {
      await submitServiceOrder(
        {
          orderType: 'top_listing',
          userPhone: topPhone || phone || 'Non précisé',
          beneficiaryPhone: paymentDetails.beneficiary,
          listingId: topBoostListing.id,
          listingTitle: topBoostListing.title,
          paymentMethod: topPaymentMethod,
          transactionRef: topRef,
          amountFcfa: config.topListingPrice,
          durationDays: topDurationDays,
          preferredDate: '',
          proofImage: topProofImage || undefined,
        },
        user,
        actorName,
      );
      setTopRef('');
      setTopProofImage('');
      setTopBoostListing(null);
      setListingActionSuccess('Demande et preuve Annonce Top enregistrées pour vérification.');
    } catch (err) {
      setTopError(formatFirestoreErrorMessage(err, 'Erreur lors de la demande Annonce Top.'));
    } finally {
      setSubmittingTop(false);
    }
  };

  const handleListingStatusChange = async (
    item: Listing,
    nextStatus: 'published' | 'reserved' | 'rented',
  ) => {
    setBusyListingId(item.id);
    setListingActionError(null);
    setListingActionSuccess(null);
    try {
      await updateListingAvailabilityStatus(item, nextStatus, user, actorName);
      setListingActionSuccess(
        nextStatus === 'reserved'
          ? 'Logement marqué réservé.'
          : nextStatus === 'rented'
            ? 'Logement marqué pris / loué.'
            : 'Logement remis disponible.',
      );
    } catch (err) {
      setListingActionError(formatFirestoreErrorMessage(err, 'Impossible de modifier le statut.'));
    } finally {
      setBusyListingId(null);
    }
  };

  const handleDeleteListing = async (item: Listing) => {
    setBusyListingId(item.id);
    setListingActionError(null);
    setListingActionSuccess(null);
    try {
      await deleteListingById(item, user, actorName);
      setConfirmDeleteId(null);
      setListingActionSuccess('Annonce enlevée définitivement.');
    } catch (err) {
      setListingActionError(formatFirestoreErrorMessage(err, 'Impossible de supprimer l’annonce.'));
    } finally {
      setBusyListingId(null);
    }
  };

  const handleSendAdditionalPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addPhoneBusy) return;
    setAddPhoneError(null);
    setAddPhoneFeedback(null);
    clearAuthError();

    const combined = combinePrefixAndLocalPhone(addPhonePrefix, addPhoneLocal);
    const e164 = normalizeE164Phone(combined, addPhonePrefix);
    const analysis = analyzePhoneNumber(e164);
    if (!analysis.isValid) {
      setAddPhoneError(analysis.error || 'Format de numéro invalide.');
      return;
    }
    if (!linkRecaptchaRef.current) {
      setAddPhoneError('Vérification de sécurité en cours de chargement.');
      return;
    }

    setAddPhoneBusy(true);
    try {
      const ok = await sendAdditionalPhoneOtp(e164, linkRecaptchaRef.current);
      if (ok) {
        setAddPhoneOtp('');
        setAddPhoneFeedback(`Code SMS envoyé sur ${e164} (${analysis.operatorLabel}).`);
      }
    } finally {
      setAddPhoneBusy(false);
    }
  };

  const handleConfirmAdditionalPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addPhoneBusy) return;
    setAddPhoneError(null);
    setAddPhoneFeedback(null);
    clearAuthError();

    setAddPhoneBusy(true);
    try {
      const ok = await confirmAdditionalPhoneOtp(addPhoneOtp);
      if (ok) {
        setAddPhoneLocal('');
        setAddPhoneOtp('');
        setAddPhoneFeedback('Numéro vérifié et associé à votre compte.');
      }
    } finally {
      setAddPhoneBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Grid: Profile + Contract Download */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={actorName} src={profile?.photoURL || user.photoURL || ''} size="lg" />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {actorName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {privatePhone ||
                    user.phoneNumber ||
                    (!isSyntheticWhatsAppEmail(user.email) && user.email) ||
                    'Compte GidaColocs'}{' '}
                  · {ACCOUNT_TYPE_LABELS[accountType]}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void signOutUser()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Déconnexion</span>
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nom complet
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Profil sur GidaColocs
                </label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountType)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="tenant">Étudiant / Locataire</option>
                  <option value="landlord">Propriétaire / Bailleur / Démarcheur</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Numéro WhatsApp / Mobile
                </label>
                <input
                  type="tel"
                  maxLength={BLUEPRINT_LIMITS.PHONE_MAX}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="70000000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Quartier souhaité / principal
                </label>
                <select
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="">Non défini</option>
                  {MARADI_NEIGHBORHOODS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <span
                className={`text-xs ${
                  profileError
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {profileError ?? profileFeedback ?? ''}
              </span>
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingProfile ? 'Enregistrement...' : 'Enregistrer le profil'}</span>
              </button>
            </div>
          </form>

          {/* Association de plusieurs numéros vérifiés (Airtel, MTN, Moov) */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>Numéros de téléphone vérifiés par SMS ({verifiedPhones.length}/5)</span>
              </div>
            </div>

            <div id="user-link-phone-recaptcha" ref={linkRecaptchaRef} className="hidden" />

            {verifiedPhones.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {verifiedPhones.map((num) => {
                  const info = analyzePhoneNumber(num);
                  const isPrimaryAuthPhone = user.phoneNumber === num;
                  return (
                    <div
                      key={num}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                    >
                      <Phone className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {num}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {info.operatorLabel}
                      </span>
                      {!isPrimaryAuthPhone && (
                        <button
                          type="button"
                          onClick={() => void removeVerifiedPhone(num)}
                          aria-label={`Retirer ${num}`}
                          className="p-0.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Aucun numéro encore vérifié par SMS sur ce compte. Associez votre numéro Airtel,
                MTN ou Moov ci-dessous.
              </p>
            )}

            {(addPhoneError || authError) && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {addPhoneError || authError}
              </p>
            )}
            {addPhoneFeedback && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{addPhoneFeedback}</p>
            )}

            {pendingPhoneOtp?.mode === 'link' ? (
              <form onSubmit={handleConfirmAdditionalPhoneOtp} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={addPhoneOtp}
                  onChange={(e) => setAddPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Code SMS (6 chiffres)"
                  className="flex-1 px-3 py-2 text-xs font-semibold tracking-widest tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={addPhoneBusy || addPhoneOtp.length !== 6}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {addPhoneBusy ? 'Validation...' : 'Confirmer'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cancelPhoneOtp();
                    setAddPhoneOtp('');
                    setAddPhoneFeedback(null);
                  }}
                  className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Annuler
                </button>
              </form>
            ) : (
              verifiedPhones.length < 5 && (
                <form onSubmit={handleSendAdditionalPhoneOtp} className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={addPhonePrefix}
                    onChange={(e) => setAddPhonePrefix(e.target.value)}
                    aria-label="Indicatif du numéro à associer"
                    className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="+227">Niger (+227)</option>
                    <option value="+229">Bénin (+229)</option>
                    <option value="+">Autre (+)</option>
                  </select>
                  <input
                    type="tel"
                    required
                    value={addPhoneLocal}
                    onChange={(e) => {
                      setAddPhoneError(null);
                      clearAuthError();
                      setAddPhoneLocal(e.target.value);
                    }}
                    placeholder="70000000"
                    className="flex-1 min-w-0 px-3 py-2 text-xs tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={addPhoneBusy || smsCooldownSec > 0}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0A2540] dark:text-white border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer shrink-0 tabular-nums"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {addPhoneBusy
                        ? 'Envoi...'
                        : smsCooldownSec > 0
                          ? `Patienter (${smsCooldownSec}s)`
                          : 'Vérifier par SMS'}
                    </span>
                  </button>
                </form>
              )
            )}
          </div>
        </section>

        {/* Paiements & Tarifs officiels GidaColocs */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Coins className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Paiements & Tarifs officiels</span>
              </div>
              <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 tabular-nums">
                {activePassCount} Pass actif{activePassCount > 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Pass visite</p>
                <p className="text-base font-bold text-[#0A2540] dark:text-white tabular-nums mt-0.5">
                  {formatFcfa(config.visitPassPrice)}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Contact vérifié + visite
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Annonce Top ({topDurationDays} j)
                </p>
                <p className="text-base font-bold text-[#0A2540] dark:text-white tabular-nums mt-0.5">
                  {formatFcfa(config.topListingPrice)}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Mise en avant prioritaire
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs space-y-1.5 tabular-nums">
              <p className="font-semibold text-slate-900 dark:text-white">
                Numéros officiels de paiement :
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Airtel Money & NITA / MyNITA :{' '}
                <strong className="text-slate-900 dark:text-white">
                  {config.airtelNumber || '+22776688125'}
                </strong>
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                MTN Mobile Money :{' '}
                <strong className="text-slate-900 dark:text-white">
                  {config.mtnNumber || '+2290157382961'}
                </strong>
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Moov Money :{' '}
                <strong className="text-slate-900 dark:text-white">
                  {config.moovNumber || '+22776688125'}
                </strong>
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              GidaColocs ne vous demandera jamais votre code PIN Mobile Money. Chaque paiement est
              vérifié manuellement avant validation et émission du reçu.
            </span>
          </div>
        </section>
      </div>

      {/* Adhésion directe au groupe officiel WhatsApp GidaColocs */}
      <section className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Groupe officiel WhatsApp GidaColocs</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Rejoignez directement la communauté GidaColocs sur WhatsApp pour suivre les annonces
            vérifiées, poser vos questions et trouver un colocataire à Maradi.
          </p>
        </div>
        <a
          href={config.whatsappGroupUrl || OFFICIAL_WHATSAPP_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <MessageCircle className="w-4 h-4 shrink-0" />
          <span>REJOINDRE LE GROUPE WHATSAPP</span>
        </a>
      </section>

      {/* Locations confirmées & Communauté WhatsApp */}
      {myRentalConfirmations.length > 0 && (
        <section className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <h2 className="text-base font-semibold text-emerald-950 dark:text-emerald-100">
                Mes locations confirmées ({myRentalConfirmations.length})
              </h2>
            </div>
          </div>

          <div className="divide-y divide-emerald-200/70 dark:divide-emerald-900/50">
            {myRentalConfirmations.map((conf) => (
              <div
                key={conf.id}
                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {conf.listingTitle} · {conf.neighborhood} ({formatFcfa(conf.priceFcfa)}/mois)
                  </p>
                  <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                    {conf.welcomeMessage}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Confirmée le {new Date(conf.confirmedAtIso).toLocaleDateString('fr-FR')} par{' '}
                    {conf.confirmedByName}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={config.whatsappGroupUrl || OFFICIAL_WHATSAPP_GROUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>REJOINDRE NOTRE COMMUNAUTÉ WHATSAPP</span>
                  </a>
                  {onOpenRentalConfirmation && (
                    <button
                      type="button"
                      onClick={() => onOpenRentalConfirmation(conf)}
                      className="px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Détails confirmation
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mes notifications & décisions GidaColocs */}
      {(() => {
        const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
        return (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#0A2540] dark:text-teal-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Mes notifications ({notifications.length})
                </h2>
                {unreadIds.length > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 tabular-nums">
                    {unreadIds.length} non lue{unreadIds.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {unreadIds.length > 0 && (
                <button
                  type="button"
                  disabled={markingNotifs}
                  onClick={() => {
                    setMarkingNotifs(true);
                    void markAllNotificationsRead(unreadIds).finally(() => setMarkingNotifs(false));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Tout marquer lu</span>
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucune notification pour le moment. Vous serez averti ici lors de la validation de vos annonces ou paiements.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[340px] overflow-y-auto">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      notif.read
                        ? 'bg-white dark:bg-slate-900'
                        : 'bg-teal-50/40 dark:bg-teal-950/20'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400 shrink-0" />
                        )}
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {notif.title}
                        </p>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          · {formatTimestamp(notif.createdAt)}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        {notif.message}
                      </p>
                    </div>
                    {!notif.read && (
                      <button
                        type="button"
                        onClick={() => void markNotificationAsRead(notif.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer shrink-0 self-start sm:self-center"
                      >
                        <Check className="w-3 h-3" />
                        <span>Marquer lu</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {/* Mes transactions & Preuves de paiement */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Mes transactions & Preuves de paiement ({myOrders.length})
          </h2>
        </div>

        {myOrders.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Vous n’avez encore effectué aucune demande de Pass visite ou Annonce Top.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {myOrders.map((ord) => (
              <div
                key={ord.id}
                className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {ord.proofImage && (
                    <button
                      type="button"
                      onClick={() => setPreviewProofOrder(ord)}
                      className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                      title="Agrandir la preuve de paiement"
                    >
                      <img
                        src={ord.proofImage}
                        alt="Capture preuve"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      {ORDER_TYPE_LABELS[ord.orderType]} · {ord.listingTitle}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {formatFcfa(ord.amountFcfa)} · {ord.paymentMethod} (Réf : {ord.transactionRef}
                      {ord.beneficiaryPhone ? ` → ${ord.beneficiaryPhone}` : ''}) ·{' '}
                      {formatTimestamp(ord.createdAt)}
                    </p>
                    {(ord.rejectionReason || ord.adminNote) && (
                      <p
                        className={`text-xs mt-1 ${
                          ord.status === 'rejected' || ord.status === 'failed'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {ord.rejectionReason || ord.adminNote}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <span
                    className={`text-xs font-semibold ${
                      ord.status === 'verified'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : ord.status === 'rejected' || ord.status === 'failed'
                          ? 'text-red-600 dark:text-red-400'
                          : ord.status === 'refunded'
                            ? 'text-slate-600 dark:text-slate-300'
                            : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {ORDER_STATUS_LABELS[ord.status]}
                  </span>
                  {ord.status === 'verified' && (
                    <button
                      type="button"
                      onClick={() => downloadPaymentReceipt(ord)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 rounded-lg cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Reçu</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Mes profils colocataires soumis */}
      {myColocProfiles.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Mes profils colocataires ({myColocProfiles.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Suivi de validation administrateur de vos fiches colocation
            </p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {myColocProfiles.map((p) => {
              const modStatus = p.moderationStatus || 'pending';
              return (
                <div
                  key={p.id}
                  className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {p.targetNeighborhood} · {COLOC_DESIRED_LABELS[p.desiredType]} · ≤{' '}
                      {formatFcfa(p.maxBudgetFcfa)}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 truncate">
                      {p.occupation} · {p.lifestyle}
                    </p>
                    {p.moderationReason && modStatus !== 'approved' && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        Motif administrateur : {p.moderationReason}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 text-[11px] font-semibold rounded shrink-0 self-start sm:self-center ${
                      modStatus === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : modStatus === 'rejected'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {CONTENT_MODERATION_LABELS[modStatus]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mes Annonces & Gestion Pris / Réservés */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Mes annonces · Disponibles, Réservés & Pris ({myListings.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Marquez un logement réservé ou pris, ou modifiez vos annonces (toute modification repasse en validation)
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToPublish}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 rounded-lg cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            + Nouvelle annonce
          </button>
        </div>

        {myListings.length > 0 && (
          <div className="px-6 py-3 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
            {(
              [
                ['all', `Toutes (${myListings.length})`],
                [
                  'pending',
                  `En attente (${myListings.filter((l) => l.status === 'pending').length})`,
                ],
                [
                  'in_review',
                  `En vérification (${myListings.filter((l) => l.status === 'in_review').length})`,
                ],
                [
                  'needs_correction',
                  `À corriger (${myListings.filter((l) => l.status === 'needs_correction').length})`,
                ],
                [
                  'published',
                  `Disponibles (${myListings.filter((l) => l.status === 'published').length})`,
                ],
                [
                  'reserved',
                  `Réservés (${myListings.filter((l) => l.status === 'reserved').length})`,
                ],
                ['rented', `Pris (${myListings.filter((l) => l.status === 'rented').length})`],
                [
                  'rejected',
                  `Refusées (${myListings.filter((l) => l.status === 'rejected').length})`,
                ],
                [
                  'suspended',
                  `Suspendues (${myListings.filter((l) => l.status === 'suspended').length})`,
                ],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setListingFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer tabular-nums ${
                  listingFilter === key
                    ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {listingActionError && (
          <div className="px-6 py-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
            {listingActionError}
          </div>
        )}
        {listingActionSuccess && (
          <div className="px-6 py-3 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300">
            {listingActionSuccess}
          </div>
        )}

        {myListings.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Vous n’avez pas encore soumis d’annonce immobilière à Maradi.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {myListings
              .filter((item) => (listingFilter === 'all' ? true : item.status === listingFilter))
              .map((item) => {
                const isApproved =
                  item.status === 'published' ||
                  item.status === 'reserved' ||
                  item.status === 'rented';
                const isConfirmingDelete = confirmDeleteId === item.id;

                return (
                  <div
                    key={item.id}
                    className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectListing(item)}
                        className="text-sm font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 text-left truncate block cursor-pointer"
                      >
                        {item.title}
                      </button>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        {item.neighborhood} · {formatFcfa(item.priceFcfa)} / mois ·{' '}
                        <span
                          className={
                            item.status === 'published'
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : item.status === 'reserved'
                                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                : item.status === 'rented'
                                  ? 'text-slate-600 dark:text-slate-300 font-semibold'
                                  : item.status === 'rejected' || item.status === 'suspended'
                                    ? 'text-red-600 dark:text-red-400 font-semibold'
                                    : 'text-amber-600 dark:text-amber-400 font-medium'
                          }
                        >
                          {LISTING_STATUS_LABELS[item.status]}
                        </span>
                        {item.isTop ? ' · Annonce TOP active' : item.topRequested ? ' · TOP demandée' : ''}
                      </p>
                      {(item.status === 'rejected' ||
                        item.status === 'suspended' ||
                        item.status === 'needs_correction') &&
                        item.moderationReason && (
                          <p
                            className={`text-xs mt-1 ${
                              item.status === 'needs_correction'
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            Motif : {item.moderationReason}
                          </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.status !== 'suspended' && (
                        <button
                          type="button"
                          onClick={() => onEditListing(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>
                            {item.status === 'rejected' || item.status === 'needs_correction'
                              ? 'Corriger & Resoumettre'
                              : 'Modifier'}
                          </span>
                        </button>
                      )}

                      {isApproved && item.status !== 'reserved' && (
                        <button
                          type="button"
                          disabled={busyListingId === item.id}
                          onClick={() => void handleListingStatusChange(item, 'reserved')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          <span>Marquer réservé</span>
                        </button>
                      )}

                      {isApproved && item.status !== 'rented' && (
                        <button
                          type="button"
                          disabled={busyListingId === item.id}
                          onClick={() => void handleListingStatusChange(item, 'rented')}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
                        >
                          Marquer pris (retirer)
                        </button>
                      )}

                      {isApproved && item.status !== 'published' && (
                        <button
                          type="button"
                          disabled={busyListingId === item.id}
                          onClick={() => void handleListingStatusChange(item, 'published')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Remettre disponible</span>
                        </button>
                      )}

                      {item.status === 'published' && !item.isTop && !item.topRequested && (
                        <button
                          type="button"
                          onClick={() => {
                            setTopError(null);
                            setTopBoostListing(item);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span>TOP ({formatFcfa(config.topListingPrice)})</span>
                        </button>
                      )}

                      {isConfirmingDelete ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyListingId === item.id}
                            onClick={() => void handleDeleteListing(item)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            {busyListingId === item.id ? 'Suppression...' : 'Confirmer suppression'}
                          </button>
                          <button
                            type="button"
                            disabled={busyListingId === item.id}
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busyListingId === item.id}
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label="Enlever définitivement l'annonce"
                          title="Enlever définitivement"
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Enlever</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Modal: Demander mise en avant Annonce TOP */}
      {topBoostListing && (() => {
        const paymentDetails = getPaymentInstructionDetails(topPaymentMethod, config);
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 my-auto">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Annonce Top : {topBoostListing.title}
              </h3>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  Tarif : {formatFcfa(config.topListingPrice)} · Durée : {topDurationDays} jours
                </p>
                <p className="text-[11px] leading-relaxed">{paymentDetails.steps}</p>
                <p className="text-[11px] tabular-nums pt-1 border-t border-slate-200 dark:border-slate-800">
                  Bénéficiaire : <strong>{paymentDetails.beneficiary}</strong>
                </p>
              </div>
              {topError && (
                <p className="text-xs text-red-600 dark:text-red-400">{topError}</p>
              )}
              <form onSubmit={handleOrderTop} className="space-y-3">
                <select
                  value={topPaymentMethod}
                  onChange={(e) => setTopPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  required
                  value={topPhone}
                  onChange={(e) => setTopPhone(e.target.value)}
                  placeholder="Votre numéro payeur"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required
                  value={topRef}
                  onChange={(e) => setTopRef(e.target.value)}
                  placeholder="Référence de transaction"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
                {topProofImage ? (
                  <div className="flex items-center gap-3 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                    <img
                      src={topProofImage}
                      alt="Capture preuve"
                      className="w-12 h-12 rounded object-cover"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">
                      Capture prête
                    </span>
                    <button
                      type="button"
                      onClick={() => setTopProofImage('')}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                    <ImagePlus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span>
                      {uploadingTopProof
                        ? 'Compression...'
                        : 'Capture d’écran du transfert (facultatif)'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingTopProof}
                      onChange={(e) => void handleTopProofFileChange(e)}
                      className="hidden"
                    />
                  </label>
                )}
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Ne saisissez jamais votre code PIN Mobile Money.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTopBoostListing(null);
                      setTopProofImage('');
                    }}
                    className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={submittingTop || uploadingTopProof}
                    className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-lg cursor-pointer"
                  >
                    {submittingTop ? 'Envoi...' : 'Envoyer la demande'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal: Aperçu preuve de paiement */}
      {previewProofOrder && previewProofOrder.proofImage && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                Preuve · {previewProofOrder.paymentMethod} ({previewProofOrder.transactionRef})
              </p>
              <button
                type="button"
                onClick={() => setPreviewProofOrder(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewProofOrder.proofImage}
              alt="Preuve de paiement"
              className="w-full max-h-[70vh] object-contain rounded-lg bg-slate-100 dark:bg-slate-950"
            />
          </div>
        </div>
      )}

      {/* Assistance WhatsApp Directe */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Assistance directe GidaColocs sur WhatsApp
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Besoin d’aide pour valider un Pass Visite, publier un logement ou organiser une visite ?
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <a
            href={buildWhatsAppUrl(
              config.whatsappNumber || '2290157382961',
              `Bonjour GidaColocs, je suis ${actorName} et j’ai besoin d’assistance depuis mon espace.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors tabular-nums"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp {config.whatsappNumber || '2290157382961'}</span>
          </a>
          <a
            href={buildWhatsAppUrl(
              config.whatsappSecondaryNumber || '22776688125',
              `Bonjour GidaColocs, je suis ${actorName} et j’ai besoin d’assistance depuis mon espace.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 rounded-lg transition-colors tabular-nums"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp {config.whatsappSecondaryNumber || '22776688125'}</span>
          </a>
        </div>
      </section>
    </div>
  );
}
