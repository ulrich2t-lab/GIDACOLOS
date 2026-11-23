import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Film,
  Flag,
  Home,
  ImagePlus,
  Lock,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  formatFirestoreErrorMessage,
  OperationType,
  reportFirestoreError,
} from '../lib/firestoreError';
import {
  getPaymentInstructionDetails,
  OFFICIAL_WHATSAPP_GROUP_URL,
  PAYMENT_METHODS,
  REPORT_REASONS,
} from '../lib/constants';
import {
  BATHROOM_LABELS,
  buildWhatsAppUrl,
  CONTENT_MODERATION_LABELS,
  downloadPaymentReceipt,
  formatFcfa,
  formatTimestamp,
  FURNISHED_LABELS,
  isSharedListingType,
  LISTING_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  ROOMMATE_PREFERENCE_LABELS,
  TOILET_LABELS,
  UTILITY_LABELS,
} from '../lib/formatters';
import {
  deleteListingReview,
  fetchListingPrivateContact,
  fetchListingVideoClip,
  removeListingColocInterest,
  submitListingReport,
  submitListingReview,
  submitServiceOrder,
  upsertListingColocInterest,
} from '../lib/qolockService';
import { formatDurationLabel, parseVideoEmbed } from '../lib/mediaUtils';
import {
  BLUEPRINT_LIMITS,
  compressImageToDataUrl,
  normalizeTransactionRefKey,
} from '../lib/validation';
import { useAuth } from '../context/AuthContext';
import type {
  ColocInterest,
  Listing,
  ListingPrivateContact,
  ListingReview,
  PassAccess,
  PaymentMethod,
  PlatformConfig,
  RentalConfirmation,
  ReportReason,
  ServiceOrder,
} from '../types/platform';

interface ListingDetailModalProps {
  listing: Listing | null;
  config: PlatformConfig;
  userOrders: ServiceOrder[];
  passAccessList: PassAccess[];
  rentalConfirmation?: RentalConfirmation | null;
  onOpenRentalConfirmation?: (conf: RentalConfirmation) => void;
  onClose: () => void;
}

export function ListingDetailModal({
  listing,
  config,
  userOrders,
  passAccessList,
  rentalConfirmation = null,
  onOpenRentalConfirmation,
  onClose,
}: ListingDetailModalProps) {
  const { user, profile, privatePhone, isAdmin, openAuthModal } = useAuth();
  const [photoIdx, setPhotoIdx] = useState(0);
  const [mediaTab, setMediaTab] = useState<'photos' | 'videos'>('photos');
  const [videoIdx, setVideoIdx] = useState(0);
  const [clipCache, setClipCache] = useState<Record<string, string>>({});
  const [loadingClip, setLoadingClip] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);
  const [privateContact, setPrivateContact] = useState<ListingPrivateContact | null>(null);
  const [loadingContact, setLoadingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [showPassForm, setShowPassForm] = useState(false);
  const [userPhone, setUserPhone] = useState(privatePhone || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Airtel Money');
  const [transactionRef, setTransactionRef] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [proofImage, setProofImage] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const [showReportForm, setShowReportForm] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('deja_loue');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  // Per-listing colocation meeting space
  const [colocInterests, setColocInterests] = useState<ColocInterest[]>([]);
  const [myInterestDoc, setMyInterestDoc] = useState<ColocInterest | null>(null);
  const [showInterestForm, setShowInterestForm] = useState(false);
  const [interestOccupation, setInterestOccupation] = useState('');
  const [interestHabits, setInterestHabits] = useState('');
  const [interestBudget, setInterestBudget] = useState('');
  const [interestMsg, setInterestMsg] = useState('');
  const [savingInterest, setSavingInterest] = useState(false);
  const [interestNotice, setInterestNotice] = useState<string | null>(null);
  const [interestError, setInterestError] = useState<string | null>(null);

  // Per-listing public reviews (moderated)
  const [publicReviews, setPublicReviews] = useState<ListingReview[]>([]);
  const [myReviews, setMyReviews] = useState<ListingReview[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const hasUnlockedContact = Boolean(
    user &&
      listing &&
      (isAdmin ||
        listing.ownerId === user.uid ||
        passAccessList.some((p) => p.listingId === listing.id)),
  );

  const showColocMeetingSpace = Boolean(
    listing && (isSharedListingType(listing.propertyType) || listing.availableSpots > 1),
  );

  useEffect(() => {
    setPhotoIdx(0);
    setVideoIdx(0);
    setClipCache({});
    setShowPassForm(false);
    setShowReportForm(false);
    setShowInterestForm(false);
    setOrderMessage(null);
    setOrderError(null);
    setProofImage('');
    setReportMessage(null);
    setReportError(null);
    setInterestNotice(null);
    setInterestError(null);
    setShowReviewForm(false);
    setEditingReviewId(null);
    setReviewNotice(null);
    setReviewError(null);
    setClipError(null);
    setContactError(null);
    setPrivateContact(null);
    setUserPhone(privatePhone || '');
    if (listing) {
      setInterestBudget(String(listing.priceFcfa));
      const hasPhotos = (listing.photos?.length ?? 0) > 0;
      const hasVideos = (listing.videos?.length ?? 0) > 0;
      setMediaTab(!hasPhotos && hasVideos ? 'videos' : 'photos');
    } else {
      setMediaTab('photos');
    }
  }, [listing?.id, privatePhone, listing]);

  useEffect(() => {
    if (!listing || !hasUnlockedContact) return;
    let active = true;
    setLoadingContact(true);
    setContactError(null);
    fetchListingPrivateContact(listing.id)
      .then((res) => {
        if (active) setPrivateContact(res);
      })
      .catch((err) => {
        if (active) {
          setContactError(
            formatFirestoreErrorMessage(err, 'Impossible de récupérer les coordonnées du bailleur.'),
          );
        }
      })
      .finally(() => {
        if (active) setLoadingContact(false);
      });
    return () => {
      active = false;
    };
  }, [listing, hasUnlockedContact]);

  useEffect(() => {
    if (!listing || !showColocMeetingSpace) {
      setColocInterests([]);
      setMyInterestDoc(null);
      return;
    }
    const q = query(
      collection(db, 'listings', listing.id, 'colocInterests'),
      where('moderationStatus', '==', 'approved'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ColocInterest, 'id'>),
        }));
        setColocInterests(list);
      },
      (err) =>
        setInterestError(
          reportFirestoreError(err, OperationType.LIST, `listings/${listing.id}/colocInterests`),
        ),
    );
    let unsubMine: (() => void) | undefined;
    if (user) {
      unsubMine = onSnapshot(
        doc(db, 'listings', listing.id, 'colocInterests', user.uid),
        (snap) => {
          if (snap.exists()) {
            setMyInterestDoc({
              id: snap.id,
              ...(snap.data() as Omit<ColocInterest, 'id'>),
            });
          } else {
            setMyInterestDoc(null);
          }
        },
        () => {
          setMyInterestDoc(null);
        },
      );
    } else {
      setMyInterestDoc(null);
    }
    return () => {
      unsub();
      unsubMine?.();
    };
  }, [listing, showColocMeetingSpace, user]);

  useEffect(() => {
    if (!listing) {
      setPublicReviews([]);
      setMyReviews([]);
      return;
    }
    const qApproved = query(
      collection(db, 'listings', listing.id, 'reviews'),
      where('moderationStatus', '==', 'approved'),
    );
    const unsubApproved = onSnapshot(
      qApproved,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ListingReview, 'id'>),
        }));
        setPublicReviews(list);
      },
      () => {
        setPublicReviews([]);
      },
    );
    let unsubMine: (() => void) | undefined;
    if (user) {
      const qMine = query(
        collection(db, 'listings', listing.id, 'reviews'),
        where('authorId', '==', user.uid),
      );
      unsubMine = onSnapshot(
        qMine,
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ListingReview, 'id'>),
          }));
          setMyReviews(list);
        },
        () => {
          setMyReviews([]);
        },
      );
    } else {
      setMyReviews([]);
    }
    return () => {
      unsubApproved();
      unsubMine?.();
    };
  }, [listing, user]);

  useEffect(() => {
    if (!listing || mediaTab !== 'videos') return;
    const activeVid = listing.videos?.[videoIdx];
    if (!activeVid || activeVid.sourceType !== 'clip' || !activeVid.clipId) return;
    if (clipCache[activeVid.clipId]) return;

    let active = true;
    setLoadingClip(true);
    setClipError(null);
    fetchListingVideoClip(listing.id, activeVid.clipId)
      .then((clip) => {
        if (active && clip?.dataUrl) {
          setClipCache((prev) => ({ ...prev, [activeVid.clipId]: clip.dataUrl }));
        }
      })
      .catch((err) => {
        if (active) {
          setClipError(formatFirestoreErrorMessage(err, 'Vidéo indisponible pour le moment.'));
        }
      })
      .finally(() => {
        if (active) setLoadingClip(false);
      });
    return () => {
      active = false;
    };
  }, [listing, mediaTab, videoIdx, clipCache]);

  if (!listing) return null;

  const photos = listing.photos ?? [];
  const videos = listing.videos ?? [];
  const activeVideo = videos[videoIdx] || videos[0];
  const existingOrder = userOrders.find(
    (o) => o.orderType === 'visit_pass' && o.listingId === listing.id,
  );
  const myInterest = myInterestDoc || (user ? colocInterests.find((c) => c.userId === user.uid) : undefined);
  const myPendingOrRejectedReviews = myReviews.filter(
    (r) => (r.moderationStatus || 'pending') !== 'approved',
  );

  const whatsappText = `Bonjour GidaColocs, je suis intéressé(e) par le logement : "${listing.title}" (${PROPERTY_TYPE_LABELS[listing.propertyType]}) situé à ${listing.neighborhood} (${formatFcfa(listing.priceFcfa)}/mois). Réf : ${listing.id}`;
  const whatsappUrlPrimary = buildWhatsAppUrl(config.whatsappNumber || '2290157382961', whatsappText);
  const whatsappSecondary = config.whatsappSecondaryNumber || '22776688125';
  const whatsappUrlSecondary = buildWhatsAppUrl(whatsappSecondary, whatsappText);

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingProof(true);
    setOrderError(null);
    try {
      const compressed = await compressImageToDataUrl(file, 960, 0.72);
      if (compressed.length > BLUEPRINT_LIMITS.PAYMENT_PROOF_MAX_LENGTH) {
        throw new Error('Capture trop lourde même après compression.');
      }
      setProofImage(compressed);
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : 'Impossible de traiter cette capture d’écran.',
      );
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSubmitPassOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const normalizedInputRef = normalizeTransactionRefKey(transactionRef);
    const duplicateLocal = userOrders.find(
      (o) =>
        o.status !== 'rejected' &&
        o.status !== 'failed' &&
        normalizeTransactionRefKey(o.transactionRef) === normalizedInputRef,
    );
    if (duplicateLocal) {
      setOrderError(
        'Vous avez déjà soumis cette référence de transaction. Vérifiez le code saisi.',
      );
      return;
    }

    const paymentDetails = getPaymentInstructionDetails(paymentMethod, config);
    setSubmittingOrder(true);
    setOrderError(null);
    setOrderMessage(null);
    try {
      await submitServiceOrder(
        {
          orderType: 'visit_pass',
          userPhone,
          beneficiaryPhone: paymentDetails.beneficiary,
          listingId: listing.id,
          listingTitle: listing.title,
          paymentMethod,
          transactionRef,
          amountFcfa: config.visitPassPrice,
          preferredDate,
          proofImage: proofImage || undefined,
        },
        user,
        profile?.displayName || user.displayName || 'Locataire',
      );
      setOrderMessage(
        'Votre demande et preuve de paiement pour le Pass visite sont enregistrées. Dès vérification manuelle par GidaColocs, le numéro direct du bailleur sera débloqué et votre reçu disponible.',
      );
      setTransactionRef('');
      setProofImage('');
      setShowPassForm(false);
    } catch (err) {
      setOrderError(formatFirestoreErrorMessage(err, 'Erreur lors de la soumission.'));
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmittingReport(true);
    setReportError(null);
    try {
      await submitListingReport(
        listing,
        reportReason,
        reportDetails,
        user,
        profile?.displayName || user.displayName || 'Utilisateur',
      );
      setReportMessage('Signalement transmis à l’administration GidaColocs.');
      setReportDetails('');
      setShowReportForm(false);
    } catch (err) {
      setReportError(formatFirestoreErrorMessage(err, 'Impossible d’envoyer le signalement.'));
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleOpenInterestForm = () => {
    if (myInterest) {
      setInterestOccupation(myInterest.occupation);
      setInterestHabits(myInterest.habits);
      setInterestBudget(String(myInterest.budgetFcfa));
      setInterestMsg(myInterest.message);
    }
    setInterestError(null);
    setShowInterestForm(true);
  };

  const handleSaveInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingInterest(true);
    setInterestError(null);
    setInterestNotice(null);
    try {
      await upsertListingColocInterest(
        listing.id,
        listing.title,
        {
          occupation: interestOccupation,
          habits: interestHabits,
          budgetFcfa: Number(interestBudget) || listing.priceFcfa,
          message: interestMsg,
        },
        user,
        profile?.displayName || user.displayName || 'Étudiant / Locataire',
        Boolean(myInterest),
        listing.neighborhood,
      );
      setShowInterestForm(false);
      setInterestNotice(
        'Votre demande de colocation a été soumise ! Elle sera visible publiquement après validation par l’administrateur.',
      );
    } catch (err) {
      setInterestError(formatFirestoreErrorMessage(err, 'Erreur lors de l’envoi.'));
    } finally {
      setSavingInterest(false);
    }
  };

  const handleRemoveInterest = async () => {
    if (!user) return;
    setInterestError(null);
    setInterestNotice(null);
    try {
      await removeListingColocInterest(
        listing.id,
        listing.title,
        user,
        profile?.displayName || user.displayName || 'Utilisateur',
      );
    } catch (err) {
      setInterestError(formatFirestoreErrorMessage(err, 'Impossible de retirer votre fiche.'));
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingReview(true);
    setReviewError(null);
    setReviewNotice(null);
    try {
      await submitListingReview(
        listing.id,
        listing.title,
        listing.neighborhood,
        reviewRating,
        reviewComment,
        user,
        profile?.displayName || user.displayName || 'Membre GidaColocs',
        editingReviewId || undefined,
      );
      setReviewComment('');
      setEditingReviewId(null);
      setShowReviewForm(false);
      setReviewNotice(
        'Votre avis a été envoyé pour validation administrateur avant publication publique.',
      );
    } catch (err) {
      setReviewError(formatFirestoreErrorMessage(err, 'Impossible d’enregistrer votre avis.'));
    } finally {
      setSavingReview(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!user) return;
    setReviewError(null);
    try {
      await deleteListingReview(
        listing.id,
        reviewId,
        listing.title,
        user,
        profile?.displayName || user.displayName || 'Utilisateur',
      );
    } catch (err) {
      setReviewError(formatFirestoreErrorMessage(err, 'Impossible de supprimer cet avis.'));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="listing-modal-title"
    >
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {listing.neighborhood}
            </span>
            <span aria-hidden="true">·</span>
            <span>{PROPERTY_TYPE_LABELS[listing.propertyType]}</span>
            {listing.bathroomType && (
              <>
                <span aria-hidden="true">·</span>
                <span>{BATHROOM_LABELS[listing.bathroomType]}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{LISTING_STATUS_LABELS[listing.status]}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Gallery (Photos & Vidéos), Real-Estate Specs & Coloc Meeting Space */}
          <div className="lg:col-span-7 space-y-6">
            {videos.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setMediaTab('photos')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      mediaTab === 'photos'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Photos ({photos.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaTab('videos')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      mediaTab === 'videos'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Vidéos ({videos.length})</span>
                  </button>
                </div>
              </div>
            )}

            {mediaTab === 'photos' ? (
              <div className="space-y-2.5">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800">
                  {photos.length > 0 ? (
                    <>
                      <img
                        src={photos[photoIdx] || photos[0]}
                        alt={`${listing.title} photo ${photoIdx + 1}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      {photos.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoIdx((prev) => (prev === 0 ? photos.length - 1 : prev - 1))
                            }
                            aria-label="Photo précédente"
                            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-slate-900/70 text-white hover:bg-slate-900 cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoIdx((prev) => (prev === photos.length - 1 ? 0 : prev + 1))
                            }
                            aria-label="Photo suivante"
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-slate-900/70 text-white hover:bg-slate-900 cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md bg-slate-900/75 text-white text-xs tabular-nums">
                            {photoIdx + 1} / {photos.length}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                      <Home className="w-10 h-10 mb-2" />
                      <span className="text-xs">Aucune photographie fournie pour ce logement</span>
                    </div>
                  )}
                </div>

                {photos.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {photos.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPhotoIdx(idx)}
                        className={`relative w-16 h-12 rounded-md overflow-hidden border shrink-0 cursor-pointer transition-opacity ${
                          photoIdx === idx
                            ? 'border-teal-600 ring-2 ring-teal-600/30 opacity-100'
                            : 'border-slate-200 dark:border-slate-700 opacity-65 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={p}
                          alt={`Miniature ${idx + 1}`}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                  {activeVideo ? (
                    activeVideo.sourceType === 'clip' ? (
                      clipCache[activeVideo.clipId] ? (
                        <video
                          key={activeVideo.clipId}
                          src={clipCache[activeVideo.clipId]}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-slate-300 space-y-2 p-6">
                          <Film className="w-8 h-8 mx-auto text-teal-400" />
                          <p className="text-xs">
                            {clipError
                              ? clipError
                              : loadingClip
                                ? 'Chargement de la vidéo du logement...'
                                : 'Vidéo prête pour la lecture.'}
                          </p>
                        </div>
                      )
                    ) : (
                      (() => {
                        const parsed = parseVideoEmbed(activeVideo.url);
                        if (parsed.kind === 'iframe') {
                          return (
                            <iframe
                              src={parsed.embedUrl}
                              title={activeVideo.title}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="w-full h-full border-0"
                            />
                          );
                        }
                        if (parsed.kind === 'video') {
                          return (
                            <video
                              src={parsed.src}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-contain"
                            />
                          );
                        }
                        return (
                          <div className="p-6 text-center space-y-3">
                            <Film className="w-10 h-10 text-teal-400 mx-auto" />
                            <p className="text-sm font-semibold text-white">{activeVideo.title}</p>
                            <p className="text-xs text-slate-400">
                              Vidéo hébergée sur {parsed.providerLabel}
                            </p>
                            <a
                              href={parsed.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                            >
                              <span>Regarder la vidéo</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        );
                      })()
                    )
                  ) : null}
                </div>

                {videos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {videos.map((v, idx) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVideoIdx(idx)}
                        className={`px-3 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                          videoIdx === idx
                            ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/50 text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        <p className="font-semibold truncate max-w-[200px]">{v.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {v.sourceType === 'clip'
                            ? `Clip (${formatDurationLabel(v.durationSec)})`
                            : 'Lien vidéo'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              {listing.isVerifiedQolock && (
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Logement vérifié physiquement par GidaColocs</span>
                </div>
              )}

              <h2
                id="listing-modal-title"
                className="text-2xl font-bold text-slate-900 dark:text-white leading-tight"
              >
                {listing.title}
              </h2>

              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {listing.description || 'Aucune description détaillée renseignée.'}
              </p>
            </div>

            {/* Real Estate Characteristics Grid */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Loyer mensuel</p>
                <p className="font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {formatFcfa(listing.priceFcfa)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Caution / Avance</p>
                <p className="font-semibold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {listing.depositMonths === 0 ? 'Aucune' : `${listing.depositMonths} mois`}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Pièces / Places</p>
                <p className="font-semibold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {listing.roomsCount ? `${listing.roomsCount} pièce${listing.roomsCount > 1 ? 's' : ''} · ` : ''}
                  {listing.availableSpots} place{listing.availableSpots > 1 ? 's' : ''}
                </p>
              </div>

              {listing.locationDetails && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Localisation</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {listing.neighborhood} — {listing.locationDetails}
                  </p>
                </div>
              )}

              {listing.availability && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Disponibilité</p>
                  <p className="font-semibold text-teal-700 dark:text-teal-400 mt-0.5">
                    {listing.availability}
                  </p>
                </div>
              )}

              {listing.bathroomType && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Douche</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {BATHROOM_LABELS[listing.bathroomType]}
                  </p>
                </div>
              )}

              {listing.toiletType && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Toilettes / WC</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {TOILET_LABELS[listing.toiletType]}
                  </p>
                </div>
              )}

              {listing.surfaceSqm && listing.surfaceSqm > 0 ? (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Surface estimée</p>
                  <p className="font-semibold text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {listing.surfaceSqm} m²
                  </p>
                </div>
              ) : null}

              {listing.furnished && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Ameublement</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {FURNISHED_LABELS[listing.furnished]}
                  </p>
                </div>
              )}

              {listing.waterElectricity && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Eau & Électricité</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {UTILITY_LABELS[listing.waterElectricity]}
                  </p>
                </div>
              )}

              {listing.roommatePreference && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Profil souhaité</p>
                  <p className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {ROOMMATE_PREFERENCE_LABELS[listing.roommatePreference]}
                  </p>
                </div>
              )}
            </div>

            {listing.houseRules && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Règles de vie & conditions du bail
                </h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">{listing.houseRules}</p>
              </div>
            )}

            {listing.amenities.length > 0 && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  Équipements & atouts immobiliers
                </h3>
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  {listing.amenities.join(' · ')}
                </p>
              </div>
            )}

            {/* Espace de rencontre des futurs colocataires pour ce logement */}
            {showColocMeetingSpace && (
              <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#0A2540] dark:text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <span>
                        Espace Rencontre Colocataires ({colocInterests.length})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Faites connaissance avec les personnes souhaitant partager ce logement.
                    </p>
                  </div>

                  {!user ? (
                    <button
                      type="button"
                      onClick={openAuthModal}
                      className="px-3 py-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800 rounded-lg cursor-pointer self-start"
                    >
                      Se connecter pour se présenter
                    </button>
                  ) : (
                    !showInterestForm && (
                      <button
                        type="button"
                        onClick={handleOpenInterestForm}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer self-start"
                      >
                        {myInterest ? 'Modifier ma présentation' : 'Me présenter pour partager'}
                      </button>
                    )
                  )}
                </div>

                {showInterestForm && user && (
                  <form
                    onSubmit={handleSaveInterest}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3"
                  >
                    {interestError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{interestError}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        maxLength={BLUEPRINT_LIMITS.COLOC_OCCUPATION_MAX}
                        value={interestOccupation}
                        onChange={(e) => setInterestOccupation(e.target.value)}
                        placeholder="Statut (ex. Étudiant UDM L2)"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                      <input
                        type="number"
                        required
                        min={0}
                        max={5000000}
                        value={interestBudget}
                        onChange={(e) => setInterestBudget(e.target.value)}
                        placeholder="Budget (FCFA)"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white tabular-nums"
                      />
                    </div>
                    <input
                      type="text"
                      required
                      maxLength={BLUEPRINT_LIMITS.COLOC_LIFESTYLE_MAX}
                      value={interestHabits}
                      onChange={(e) => setInterestHabits(e.target.value)}
                      placeholder="Habitudes (ex. Calme, non-fumeur, propre)"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <textarea
                      rows={2}
                      required
                      maxLength={BLUEPRINT_LIMITS.COLOC_MESSAGE_MAX}
                      value={interestMsg}
                      onChange={(e) => setInterestMsg(e.target.value)}
                      placeholder="Présentez-vous aux autres futurs colocataires..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowInterestForm(false)}
                        className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={savingInterest}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        {savingInterest ? 'Envoi...' : 'Soumettre pour validation'}
                      </button>
                    </div>
                  </form>
                )}

                {interestNotice && (
                  <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">
                    {interestNotice}
                  </div>
                )}

                {myInterest && (myInterest.moderationStatus || 'pending') !== 'approved' && (
                  <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-amber-900 dark:text-amber-200">
                        Ma candidature colocation ·{' '}
                        {CONTENT_MODERATION_LABELS[myInterest.moderationStatus || 'pending']}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveInterest()}
                        aria-label="Retirer ma demande"
                        className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{myInterest.message}</p>
                    {myInterest.moderationReason && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-300">
                        Message administrateur : {myInterest.moderationReason}
                      </p>
                    )}
                  </div>
                )}

                {colocInterests.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Aucun candidat approuvé ne s’est encore présenté pour ce logement.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {colocInterests.map((c) => (
                      <div key={c.id} className="p-4 bg-white dark:bg-slate-900 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {c.userName}
                            </span>
                            <span className="text-slate-400 mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-teal-700 dark:text-teal-400 font-medium">
                              {c.occupation}
                            </span>
                            <span className="text-slate-400 mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span className="tabular-nums text-slate-600 dark:text-slate-300">
                              Budget {formatFcfa(c.budgetFcfa)}
                            </span>
                          </div>
                          {user && (user.uid === c.userId || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveInterest()}
                              aria-label="Retirer cette présentation"
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{c.message}</p>
                        <p className="text-[11px] text-slate-400">Habitudes : {c.habits}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Avis et commentaires publics (soumis à validation administrateur) */}
            <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0A2540] dark:text-white flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    <span>
                      Avis & commentaires publics ({publicReviews.length})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Les avis publiés sont modérés par l’administrateur avant affichage.
                  </p>
                </div>

                {!user ? (
                  <button
                    type="button"
                    onClick={openAuthModal}
                    className="px-3 py-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800 rounded-lg cursor-pointer self-start"
                  >
                    Se connecter pour laisser un avis
                  </button>
                ) : (
                  !showReviewForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingReviewId(null);
                        setReviewRating(5);
                        setReviewComment('');
                        setReviewError(null);
                        setShowReviewForm(true);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer self-start"
                    >
                      Laisser un avis
                    </button>
                  )
                )}
              </div>

              {reviewNotice && (
                <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">
                  {reviewNotice}
                </div>
              )}

              {showReviewForm && user && (
                <form
                  onSubmit={handleSubmitReview}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3"
                >
                  {reviewError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{reviewError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Note :
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((starVal) => (
                        <button
                          key={starVal}
                          type="button"
                          onClick={() => setReviewRating(starVal)}
                          aria-label={`Noter ${starVal} sur 5`}
                          className={`p-1 rounded cursor-pointer ${
                            starVal <= reviewRating
                              ? 'text-amber-500'
                              : 'text-slate-300 dark:text-slate-600'
                          }`}
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    required
                    maxLength={BLUEPRINT_LIMITS.REVIEW_COMMENT_MAX}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Partagez votre avis sur ce logement ou la visite..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowReviewForm(false);
                        setEditingReviewId(null);
                      }}
                      className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={savingReview || !reviewComment.trim()}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      {savingReview ? 'Envoi...' : 'Soumettre l’avis'}
                    </button>
                  </div>
                </form>
              )}

              {myPendingOrRejectedReviews.length > 0 && (
                <div className="space-y-2">
                  {myPendingOrRejectedReviews.map((rev) => {
                    const modStatus = rev.moderationStatus || 'pending';
                    return (
                      <div
                        key={rev.id}
                        className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-amber-900 dark:text-amber-200">
                            Mon avis · {CONTENT_MODERATION_LABELS[modStatus]} · {rev.rating}/5
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReviewId(rev.id);
                                setReviewRating(rev.rating);
                                setReviewComment(rev.comment);
                                setShowReviewForm(true);
                              }}
                              className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteReview(rev.id)}
                              aria-label="Supprimer mon avis"
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{rev.comment}</p>
                        {rev.moderationReason && (
                          <p className="text-[11px] text-amber-800 dark:text-amber-300">
                            Motif administrateur : {rev.moderationReason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {publicReviews.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Aucun avis public approuvé pour ce logement pour le moment.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {publicReviews.map((rev) => (
                    <div key={rev.id} className="p-4 bg-white dark:bg-slate-900 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {rev.authorName}
                          </span>
                          <span className="text-amber-500 font-semibold tabular-nums">
                            {rev.rating}/5 ★
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            {formatTimestamp(rev.createdAt)}
                          </span>
                          {user && (user.uid === rev.authorId || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteReview(rev.id)}
                              aria-label="Supprimer cet avis"
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: WhatsApp Support, Pass Visite & Unlocked Contact */}
          <div className="lg:col-span-5 space-y-5">
            {/* Direct WhatsApp Assistance */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {isSharedListingType(listing.propertyType)
                    ? 'Part mensuelle estimée'
                    : 'Loyer mensuel'}
                </p>
                <p className="text-2xl font-bold text-[#0A2540] dark:text-white tabular-nums">
                  {formatFcfa(listing.priceFcfa)}
                </p>
              </div>

              <div className="space-y-2">
                <a
                  href={whatsappUrlPrimary}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors tabular-nums"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>Assistance WhatsApp ({config.whatsappNumber || '2290157382961'})</span>
                </a>
                {whatsappSecondary && whatsappSecondary !== config.whatsappNumber && (
                  <a
                    href={whatsappUrlSecondary}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 rounded-lg transition-colors tabular-nums"
                  >
                    <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>WhatsApp Niger ({whatsappSecondary})</span>
                  </a>
                )}
              </div>

              {/* Confirmed rental: Welcome + Official WhatsApp Community CTA (strictly when confirmed) */}
              {rentalConfirmation && (
                <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/50 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Location officiellement confirmée</span>
                  </div>
                  <p className="text-xs text-emerald-950 dark:text-emerald-100 leading-relaxed">
                    {rentalConfirmation.welcomeMessage}
                  </p>
                  <div className="flex flex-col gap-2">
                    <a
                      href={config.whatsappGroupUrl || OFFICIAL_WHATSAPP_GROUP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors text-center"
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      <span>REJOINDRE NOTRE COMMUNAUTÉ WHATSAPP</span>
                    </a>
                    {onOpenRentalConfirmation && (
                      <button
                        type="button"
                        onClick={() => onOpenRentalConfirmation(rentalConfirmation)}
                        className="w-full px-3 py-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg cursor-pointer"
                      >
                        Voir ma confirmation de location
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Status notices for reserved / rented listings */}
              {(listing.status === 'reserved' || listing.status === 'rented') && (
                <div
                  className={`p-3.5 rounded-lg border text-xs leading-relaxed ${
                    listing.status === 'reserved'
                      ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {listing.status === 'reserved' ? (
                    <span>
                      <strong>Logement réservé :</strong> une réservation est en cours sur ce bien.
                      Contactez l’assistance WhatsApp pour vérifier s’il se libère ou voir des
                      logements équivalents.
                    </span>
                  ) : (
                    <span>
                      <strong>Logement pris / loué :</strong> ce bien n’est plus disponible à la
                      visite.
                    </span>
                  )}
                </div>
              )}

              {/* Unlocked Contact vs Pass Visite Flow */}
              {hasUnlockedContact ? (
                <div className="p-4 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-teal-300">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Contact bailleur débloqué</span>
                  </div>
                  {loadingContact ? (
                    <p className="text-xs text-slate-500">Chargement des coordonnées...</p>
                  ) : contactError ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{contactError}</p>
                  ) : privateContact ? (
                    <>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {privateContact.contactName || listing.ownerName}
                      </p>
                      <p className="text-sm font-mono font-semibold text-[#0A2540] dark:text-teal-200 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{privateContact.contactPhone || 'Voir support WhatsApp'}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Contact disponible auprès du support WhatsApp.
                    </p>
                  )}
                </div>
              ) : (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      Le numéro direct du bailleur est protégé contre les arnaques. Obtenez un{' '}
                      <strong>Pass Visite ({formatFcfa(config.visitPassPrice)})</strong> pour
                      visiter ce logement et obtenir ses coordonnées vérifiées.
                    </span>
                  </div>

                  {existingOrder && (
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          Pass visite : {ORDER_STATUS_LABELS[existingOrder.status]}
                        </p>
                        {existingOrder.receiptNumber && (
                          <span className="text-[11px] font-mono text-teal-700 dark:text-teal-400">
                            {existingOrder.receiptNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                        {existingOrder.paymentMethod} · Réf : {existingOrder.transactionRef}
                        {existingOrder.beneficiaryPhone
                          ? ` → ${existingOrder.beneficiaryPhone}`
                          : ''}
                      </p>
                      {(existingOrder.rejectionReason || existingOrder.adminNote) && (
                        <p
                          className={
                            existingOrder.status === 'rejected' || existingOrder.status === 'failed'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-600 dark:text-slate-300'
                          }
                        >
                          {existingOrder.rejectionReason || existingOrder.adminNote}
                        </p>
                      )}
                      {existingOrder.status === 'verified' && (
                        <button
                          type="button"
                          onClick={() => downloadPaymentReceipt(existingOrder)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-lg cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Télécharger mon reçu</span>
                        </button>
                      )}
                    </div>
                  )}

                  {orderMessage && (
                    <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">
                      {orderMessage}
                    </div>
                  )}

                  {listing.status === 'published' && (
                    !user ? (
                      <button
                        type="button"
                        onClick={openAuthModal}
                        className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-[#0A2540] hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        Se connecter pour demander une visite
                      </button>
                    ) : !showPassForm ? (
                      <button
                        type="button"
                        onClick={() => setShowPassForm(true)}
                        className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer"
                      >
                        Acheter un Pass visite ({formatFcfa(config.visitPassPrice)})
                      </button>
                    ) : null
                  )}
                </div>
              )}

              {/* Pass Visite Checkout Form */}
              {showPassForm && user && (() => {
                const paymentDetails = getPaymentInstructionDetails(paymentMethod, config);
                return (
                  <form
                    onSubmit={handleSubmitPassOrder}
                    className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3"
                  >
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                      <p className="font-semibold text-slate-900 dark:text-white tabular-nums">
                        Montant à régler : {formatFcfa(config.visitPassPrice)}
                      </p>
                      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                        {paymentDetails.steps}
                      </p>
                      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-0.5 text-[11px] tabular-nums">
                        <p>
                          Airtel Money / NITA :{' '}
                          <strong>{config.airtelNumber || '+22776688125'}</strong>
                        </p>
                        <p>
                          MTN Mobile Money :{' '}
                          <strong>{config.mtnNumber || '+2290157382961'}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Ne saisissez jamais votre code PIN Mobile Money ici. GidaColocs vérifie
                        manuellement votre preuve avant de débloquer le contact.
                      </span>
                    </div>

                    {orderError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{orderError}</p>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Moyen de paiement utilisé
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      >
                        {PAYMENT_METHODS.map((pm) => (
                          <option key={pm} value={pm}>
                            {pm}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Votre numéro payeur (WhatsApp / Téléphone)
                      </label>
                      <input
                        type="tel"
                        required
                        maxLength={BLUEPRINT_LIMITS.PHONE_MAX}
                        value={userPhone}
                        onChange={(e) => setUserPhone(e.target.value)}
                        placeholder="70000000"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Référence / ID de transaction
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={BLUEPRINT_LIMITS.TRANSACTION_REF_MAX}
                        value={transactionRef}
                        onChange={(e) => setTransactionRef(e.target.value)}
                        placeholder="Ex. MP261118.1430.A12345"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Capture d’écran du paiement (facultatif)
                      </label>
                      {proofImage ? (
                        <div className="flex items-center gap-3 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                          <img
                            src={proofImage}
                            alt="Preuve de paiement"
                            className="w-14 h-14 rounded object-cover border border-slate-200 dark:border-slate-700"
                          />
                          <div className="flex-1 min-w-0 text-[11px] text-slate-600 dark:text-slate-300">
                            Capture jointe prête à être vérifiée.
                          </div>
                          <button
                            type="button"
                            onClick={() => setProofImage('')}
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label="Retirer la capture"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer">
                          <ImagePlus className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                          <span>
                            {uploadingProof
                              ? 'Compression en cours...'
                              : 'Joindre une capture SMS / reçu'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingProof}
                            onChange={(e) => void handleProofFileChange(e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Date souhaitée pour la visite
                      </label>
                      <input
                        type="date"
                        value={preferredDate}
                        onChange={(e) => setPreferredDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowPassForm(false)}
                        className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={submittingOrder || uploadingProof}
                        className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-lg cursor-pointer"
                      >
                        {submittingOrder ? 'Envoi...' : 'Envoyer la preuve'}
                      </button>
                    </div>
                  </form>
                );
              })()}
            </div>

            {/* Report Suspicious Listing */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              {reportMessage ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">{reportMessage}</p>
              ) : !showReportForm ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      openAuthModal();
                    } else {
                      setShowReportForm(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Signaler une annonce suspecte ou déjà louée</span>
                </button>
              ) : (
                <form onSubmit={handleSubmitReport} className="space-y-3">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Signaler ce logement
                  </p>
                  {reportError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{reportError}</p>
                  )}
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as ReportReason)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    {REPORT_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={2}
                    required
                    maxLength={BLUEPRINT_LIMITS.REPORT_DETAILS_MAX}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Précisez votre constat..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReportForm(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={submittingReport}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                    >
                      {submittingReport ? 'Envoi...' : 'Envoyer le signalement'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
