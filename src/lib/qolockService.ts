import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreError';
import {
  BLUEPRINT_LIMITS,
  clampText,
  isValidFirestoreId,
  normalizeTransactionRefKey,
  sanitizeText,
} from './validation';
import type {
  AccountStatus,
  AccountType,
  ActivityTargetType,
  BathroomType,
  ColocDesiredType,
  ColocGenderPreference,
  ColocInterest,
  ColocMessage,
  ColocProfile,
  ColocProfileStatus,
  ContentModerationEntry,
  ContentModerationStatus,
  DepositorStatus,
  FurnishedType,
  Listing,
  ListingModerationEntry,
  ListingPrivateContact,
  ListingPrivateVerification,
  ListingReview,
  ListingStatus,
  ListingVideo,
  ListingVideoClip,
  NotificationCategory,
  PaymentMethod,
  PaymentVerificationEntry,
  PlatformConfig,
  PropertyType,
  ReportReason,
  ReportStatus,
  RoommatePreference,
  ServiceOrder,
  ToiletType,
  UserPrivateInfo,
  UserProfile,
  WaterElectricityType,
} from '../types/platform';
import type { PendingVideoDraft } from './mediaUtils';

function buildNotificationDoc(
  userId: string,
  category: NotificationCategory,
  title: string,
  message: string,
  targetId?: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    userId,
    category,
    title: sanitizeText(title, BLUEPRINT_LIMITS.NOTIFICATION_TITLE_MAX) || 'Notification GidaColocs',
    message: sanitizeText(message, BLUEPRINT_LIMITS.NOTIFICATION_MESSAGE_MAX) || 'Mise à jour sur votre compte.',
    read: false,
    createdAt: serverTimestamp(),
  };
  if (targetId) {
    payload.targetId = sanitizeText(targetId, BLUEPRINT_LIMITS.ID_MAX);
  }
  return payload;
}

function generateId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw}`;
}

export async function logPlatformActivity(
  user: User,
  actorName: string,
  action: string,
  targetTitle: string,
  targetType: ActivityTargetType,
): Promise<void> {
  const activityId = generateId('act');
  const path = `activities/${activityId}`;
  try {
    await setDoc(doc(db, 'activities', activityId), {
      actorId: user.uid,
      actorName: sanitizeText(actorName || 'Utilisateur', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Utilisateur',
      action: sanitizeText(action, BLUEPRINT_LIMITS.ACTIVITY_ACTION_MAX) || 'Action',
      targetTitle: clampText(targetTitle.trim(), BLUEPRINT_LIMITS.ACTIVITY_TARGET_TITLE_MAX),
      targetType,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn(`Non-fatal activity log warning at ${path}:`, error);
  }
}

export async function updateUserAccountSettings(
  user: User,
  input: {
    displayName: string;
    accountType: AccountType;
    neighborhood: string;
    phone: string;
  },
): Promise<void> {
  const cleanName = sanitizeText(input.displayName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Utilisateur';
  const cleanNeighborhood = sanitizeText(input.neighborhood, BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX);
  const cleanPhone = sanitizeText(input.phone, BLUEPRINT_LIMITS.PHONE_MAX);
  const isSyntheticEmail = Boolean(user.email && /^wa\.\d+@qolock\.app$/i.test(user.email));
  const cleanEmail = isSyntheticEmail
    ? ''
    : sanitizeText((user.email || '').toLowerCase(), BLUEPRINT_LIMITS.EMAIL_MAX);

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', user.uid), {
    displayName: cleanName,
    accountType: input.accountType,
    neighborhood: cleanNeighborhood,
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(db, 'users', user.uid, 'private', 'info'),
    {
      email: cleanEmail,
      phone: cleanPhone,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
  }
}

export async function adminUpdateUserAccountType(
  targetUid: string,
  accountType: AccountType,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      accountType,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }
}

export async function adminSetUserAccountStatus(
  targetUser: UserProfile,
  accountStatus: AccountStatus,
  reason: string,
  adminUser: User,
  adminName: string,
): Promise<void> {
  if (targetUser.uid === adminUser.uid) {
    throw new Error('Vous ne pouvez pas suspendre votre propre compte administrateur.');
  }
  const cleanReason =
    accountStatus === 'suspended'
      ? sanitizeText(reason, BLUEPRINT_LIMITS.SUSPENSION_REASON_MAX) ||
        'Compte suspendu par l’administration GidaColocs.'
      : '';

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', targetUser.uid), {
    accountStatus,
    suspendedReason: cleanReason,
    updatedAt: serverTimestamp(),
  });

  const notifId = generateId('notif');
  const notifTitle =
    accountStatus === 'suspended'
      ? 'Compte temporairement suspendu'
      : 'Compte réactivé';
  const notifMessage =
    accountStatus === 'suspended'
      ? `Votre compte a été suspendu. Motif : ${cleanReason}`
      : 'Votre compte GidaColocs a été réactivé. Vous pouvez à nouveau publier et interagir sur la plateforme.';
  batch.set(
    doc(db, 'notifications', notifId),
    buildNotificationDoc(targetUser.uid, 'account', notifTitle, notifMessage, targetUser.uid),
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }

  await logPlatformActivity(
    adminUser,
    adminName,
    accountStatus === 'suspended' ? 'Compte utilisateur suspendu' : 'Compte utilisateur réactivé',
    `${targetUser.displayName}${cleanReason ? ` · ${cleanReason}` : ''}`,
    'user',
  );
}

export async function markNotificationAsRead(notifId: string): Promise<void> {
  const path = `notifications/${notifId}`;
  try {
    await updateDoc(doc(db, 'notifications', notifId), {
      read: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsRead(unreadIds: string[]): Promise<void> {
  const targets = unreadIds.filter(Boolean).slice(0, 100);
  if (targets.length === 0) return;
  const batch = writeBatch(db);
  for (const notifId of targets) {
    batch.update(doc(db, 'notifications', notifId), { read: true });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications (batch read)');
  }
}

export async function adminFetchUserPrivateInfo(
  targetUid: string,
): Promise<UserPrivateInfo | null> {
  const path = `users/${targetUid}/private/info`;
  try {
    const snap = await getDoc(doc(db, 'users', targetUid, 'private', 'info'));
    if (!snap.exists()) return null;
    return snap.data() as UserPrivateInfo;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export interface CreateListingInput {
  title: string;
  description: string;
  neighborhood: string;
  locationDetails: string;
  propertyType: PropertyType;
  priceFcfa: number;
  depositMonths: number;
  availableSpots: number;
  roomsCount: number;
  availability: string;
  amenities: string[];
  photos: string[];
  videos?: PendingVideoDraft[];
  removedClipIds?: string[];
  bathroomType: BathroomType;
  toiletType: ToiletType;
  furnished: FurnishedType;
  waterElectricity: WaterElectricityType;
  surfaceSqm: number;
  roommatePreference: RoommatePreference;
  houseRules: string;
  contactPhone: string;
  contactWhatsapp?: string;
  contactName: string;
  depositorAddress: string;
  depositorStatus: DepositorStatus;
  authorizationNote: string;
  publishImmediately?: boolean;
  isVerifiedQolock?: boolean;
  isTop?: boolean;
}

export async function createListing(
  input: CreateListingInput,
  user: User,
  actorName: string,
  isAdmin: boolean,
): Promise<string> {
  const listingId = generateId('log');
  const cleanTitle = sanitizeText(input.title, BLUEPRINT_LIMITS.LISTING_TITLE_MAX);
  if (!cleanTitle) throw new Error('Le titre du logement est requis.');

  const cleanNeighborhood =
    sanitizeText(input.neighborhood || 'Ali Dan Sofo', BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX) ||
    'Ali Dan Sofo';
  const cleanLocationDetails = sanitizeText(
    input.locationDetails || '',
    BLUEPRINT_LIMITS.LOCATION_DETAILS_MAX,
  );
  const cleanAvailability = sanitizeText(
    input.availability || 'Disponible immédiatement',
    BLUEPRINT_LIMITS.AVAILABILITY_MAX,
  );
  const cleanOwnerName =
    sanitizeText(actorName || 'Propriétaire', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Propriétaire';
  const cleanContactName =
    sanitizeText(input.contactName || cleanOwnerName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
    cleanOwnerName;
  const cleanContactPhone = sanitizeText(input.contactPhone || '', BLUEPRINT_LIMITS.PHONE_MAX);
  const cleanContactWhatsapp = sanitizeText(
    input.contactWhatsapp || '',
    BLUEPRINT_LIMITS.PHONE_MAX,
  );
  const cleanDepositorAddress = sanitizeText(
    input.depositorAddress || cleanNeighborhood,
    BLUEPRINT_LIMITS.DEPOSITOR_ADDRESS_MAX,
  );
  const cleanAuthNote = sanitizeText(
    input.authorizationNote || '',
    BLUEPRINT_LIMITS.AUTHORIZATION_NOTE_MAX,
  );

  const cleanAmenities = input.amenities
    .map((a) => sanitizeText(a, 60))
    .filter(Boolean)
    .slice(0, BLUEPRINT_LIMITS.MAX_AMENITIES);
  const cleanPhotos = input.photos
    .filter((p) => typeof p === 'string' && p.length > 0 && p.length <= 220000)
    .slice(0, BLUEPRINT_LIMITS.MAX_PHOTOS);

  if (!isAdmin) {
    if (cleanPhotos.length < 1) {
      throw new Error('Ajoutez au moins une photo réelle du logement avant de soumettre.');
    }
    if (!cleanContactName || !cleanContactPhone || !cleanDepositorAddress) {
      throw new Error(
        'Veuillez renseigner votre nom complet, votre téléphone et votre quartier/adresse.',
      );
    }
    if (input.depositorStatus !== 'proprietaire' && !cleanAuthNote) {
      throw new Error(
        'Merci de préciser votre justificatif ou autorisation à proposer ce logement.',
      );
    }
  }

  const rawVideos = (input.videos || []).slice(0, BLUEPRINT_LIMITS.MAX_VIDEOS);
  const cleanVideos: ListingVideo[] = [];
  const clipsToSave: Array<{ clipId: string; draft: PendingVideoDraft }> = [];

  for (const v of rawVideos) {
    const cleanVidTitle = sanitizeText(v.title || 'Visite vidéo du logement', BLUEPRINT_LIMITS.VIDEO_TITLE_MAX) || 'Visite vidéo';
    if (v.sourceType === 'clip' && v.dataUrl && v.dataUrl.length <= BLUEPRINT_LIMITS.VIDEO_CLIP_DATA_MAX_LENGTH) {
      const clipId = v.clipId || generateId('clip');
      cleanVideos.push({
        id: sanitizeText(v.id || clipId, 64),
        title: cleanVidTitle,
        sourceType: 'clip',
        url: '',
        clipId,
        durationSec: Math.max(0, Math.min(3600, Math.round(v.durationSec || 0))),
      });
      clipsToSave.push({ clipId, draft: v });
    } else if (v.sourceType === 'url' && v.url.trim()) {
      cleanVideos.push({
        id: sanitizeText(v.id || generateId('vid'), 64),
        title: cleanVidTitle,
        sourceType: 'url',
        url: sanitizeText(v.url, BLUEPRINT_LIMITS.VIDEO_URL_MAX),
        clipId: '',
        durationSec: Math.max(0, Math.min(3600, Math.round(v.durationSec || 0))),
      });
    }
  }

  const status: ListingStatus = isAdmin && input.publishImmediately ? 'published' : 'pending';
  const batch = writeBatch(db);
  const nowIso = new Date().toISOString().slice(0, 30);

  const listingDoc: Record<string, unknown> = {
    title: cleanTitle,
    description: clampText(input.description.trim(), BLUEPRINT_LIMITS.LISTING_DESC_MAX),
    neighborhood: cleanNeighborhood,
    locationDetails: cleanLocationDetails,
    propertyType: input.propertyType,
    priceFcfa: Math.max(0, Math.min(5000000, Math.round(Number(input.priceFcfa) || 0))),
    depositMonths: Math.max(0, Math.min(12, Math.round(Number(input.depositMonths) || 0))),
    availableSpots: Math.max(1, Math.min(20, Math.round(Number(input.availableSpots) || 1))),
    roomsCount: Math.max(1, Math.min(30, Math.round(Number(input.roomsCount) || 1))),
    availability: cleanAvailability,
    amenities: cleanAmenities,
    photos: cleanPhotos,
    videos: cleanVideos,
    bathroomType: input.bathroomType,
    toiletType: input.toiletType,
    furnished: input.furnished,
    waterElectricity: input.waterElectricity,
    surfaceSqm: Math.max(0, Math.min(2000, Math.round(Number(input.surfaceSqm) || 0))),
    roommatePreference: input.roommatePreference,
    houseRules: clampText((input.houseRules || '').trim(), BLUEPRINT_LIMITS.HOUSE_RULES_MAX),
    status,
    isVerifiedQolock: isAdmin ? Boolean(input.isVerifiedQolock) : false,
    isTop: isAdmin ? Boolean(input.isTop) : false,
    topRequested: false,
    ownerId: user.uid,
    ownerName: cleanOwnerName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (status === 'published' && isAdmin) {
    listingDoc.validatedByName = cleanOwnerName;
    listingDoc.validatedByEmail = sanitizeText(user.email || '', BLUEPRINT_LIMITS.EMAIL_MAX);
    listingDoc.validatedAtIso = nowIso;
    listingDoc.moderationHistory = [
      {
        status: 'published',
        reason: 'Publication directe par l’administrateur',
        actorName: cleanOwnerName,
        actorEmail: sanitizeText(user.email || '', BLUEPRINT_LIMITS.EMAIL_MAX),
        atIso: nowIso,
      },
    ];
  }

  batch.set(doc(db, 'listings', listingId), listingDoc);

  batch.set(doc(db, 'listings', listingId, 'private', 'contact'), {
    ownerId: user.uid,
    contactName: cleanContactName,
    contactPhone: cleanContactPhone || cleanContactWhatsapp || 'Non renseigné',
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'listings', listingId, 'private', 'verification'), {
    ownerId: user.uid,
    contactName: cleanContactName,
    contactPhone: cleanContactPhone || cleanContactWhatsapp || 'Non renseigné',
    contactWhatsapp: cleanContactWhatsapp,
    depositorAddress: cleanDepositorAddress,
    depositorStatus: input.depositorStatus || 'proprietaire',
    authorizationNote:
      cleanAuthNote ||
      (input.depositorStatus === 'proprietaire'
        ? 'Déclaré comme propriétaire direct du logement.'
        : 'Autorisation déclarée par le déposant.'),
    updatedAt: serverTimestamp(),
  });

  if (status === 'pending') {
    const alertId = generateId('alert');
    batch.set(doc(db, 'adminAlerts', alertId), {
      type: 'new_listing',
      listingId,
      listingTitle: cleanTitle,
      neighborhood: cleanNeighborhood,
      ownerId: user.uid,
      ownerName: cleanOwnerName,
      depositorStatus: input.depositorStatus || 'proprietaire',
      read: false,
      createdAt: serverTimestamp(),
    });
  }

  for (const { clipId, draft } of clipsToSave) {
    batch.set(doc(db, 'listings', listingId, 'videoClips', clipId), {
      ownerId: user.uid,
      title: sanitizeText(draft.title || 'Visite vidéo', BLUEPRINT_LIMITS.VIDEO_TITLE_MAX) || 'Visite vidéo',
      mimeType: draft.mimeType === 'video/mp4' ? 'video/mp4' : 'video/webm',
      dataUrl: draft.dataUrl,
      durationSec: Math.max(0, Math.min(BLUEPRINT_LIMITS.VIDEO_CLIP_MAX_SECONDS, Math.round(draft.durationSec || 0))),
      isPublic: true,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `listings/${listingId}`);
  }

  await logPlatformActivity(
    user,
    actorName,
    status === 'published' ? 'Logement publié' : 'Annonce soumise gratuitement pour validation',
    cleanTitle,
    'listing',
  );
  return listingId;
}

export async function updateListingDetails(
  listingId: string,
  ownerId: string,
  input: Omit<CreateListingInput, 'publishImmediately' | 'isVerifiedQolock' | 'isTop'>,
  user: User,
  actorName: string,
  options?: { resubmitForReview?: boolean; isAdminEditor?: boolean },
): Promise<void> {
  const cleanTitle = sanitizeText(input.title, BLUEPRINT_LIMITS.LISTING_TITLE_MAX);
  if (!cleanTitle) throw new Error('Le titre est requis.');

  const cleanNeighborhood = sanitizeText(
    input.neighborhood || 'Ali Dan Sofo',
    BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX,
  );
  const cleanLocationDetails = sanitizeText(
    input.locationDetails || '',
    BLUEPRINT_LIMITS.LOCATION_DETAILS_MAX,
  );
  const cleanAvailability = sanitizeText(
    input.availability || 'Disponible immédiatement',
    BLUEPRINT_LIMITS.AVAILABILITY_MAX,
  );
  const cleanContactName =
    sanitizeText(input.contactName || actorName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || actorName;
  const cleanContactPhone = sanitizeText(input.contactPhone || '', BLUEPRINT_LIMITS.PHONE_MAX);
  const cleanContactWhatsapp = sanitizeText(
    input.contactWhatsapp || '',
    BLUEPRINT_LIMITS.PHONE_MAX,
  );
  const cleanDepositorAddress = sanitizeText(
    input.depositorAddress || cleanNeighborhood,
    BLUEPRINT_LIMITS.DEPOSITOR_ADDRESS_MAX,
  );
  const cleanAuthNote = sanitizeText(
    input.authorizationNote || '',
    BLUEPRINT_LIMITS.AUTHORIZATION_NOTE_MAX,
  );

  const cleanAmenities = input.amenities
    .map((a) => sanitizeText(a, 60))
    .filter(Boolean)
    .slice(0, BLUEPRINT_LIMITS.MAX_AMENITIES);
  const cleanPhotos = input.photos
    .filter((p) => typeof p === 'string' && p.length > 0 && p.length <= 220000)
    .slice(0, BLUEPRINT_LIMITS.MAX_PHOTOS);

  if (!options?.isAdminEditor && cleanPhotos.length < 1) {
    throw new Error('Ajoutez au moins une photo réelle du logement.');
  }

  const rawVideos = (input.videos || []).slice(0, BLUEPRINT_LIMITS.MAX_VIDEOS);
  const cleanVideos: ListingVideo[] = [];
  const newClipsToSave: Array<{ clipId: string; draft: PendingVideoDraft }> = [];

  for (const v of rawVideos) {
    const cleanVidTitle = sanitizeText(v.title || 'Visite vidéo du logement', BLUEPRINT_LIMITS.VIDEO_TITLE_MAX) || 'Visite vidéo';
    if (v.sourceType === 'clip') {
      const clipId = v.clipId || generateId('clip');
      if (v.isExistingClip || (v.dataUrl && v.dataUrl.length <= BLUEPRINT_LIMITS.VIDEO_CLIP_DATA_MAX_LENGTH)) {
        cleanVideos.push({
          id: sanitizeText(v.id || clipId, 64),
          title: cleanVidTitle,
          sourceType: 'clip',
          url: '',
          clipId,
          durationSec: Math.max(0, Math.min(3600, Math.round(v.durationSec || 0))),
        });
        if (!v.isExistingClip && v.dataUrl) {
          newClipsToSave.push({ clipId, draft: v });
        }
      }
    } else if (v.sourceType === 'url' && v.url.trim()) {
      cleanVideos.push({
        id: sanitizeText(v.id || generateId('vid'), 64),
        title: cleanVidTitle,
        sourceType: 'url',
        url: sanitizeText(v.url, BLUEPRINT_LIMITS.VIDEO_URL_MAX),
        clipId: '',
        durationSec: Math.max(0, Math.min(3600, Math.round(v.durationSec || 0))),
      });
    }
  }

  const mustRevalidate = options?.resubmitForReview ?? !options?.isAdminEditor;

  const batch = writeBatch(db);
  const listingPatch: Record<string, unknown> = {
    title: cleanTitle,
    description: clampText(input.description.trim(), BLUEPRINT_LIMITS.LISTING_DESC_MAX),
    neighborhood: cleanNeighborhood,
    locationDetails: cleanLocationDetails,
    propertyType: input.propertyType,
    priceFcfa: Math.max(0, Math.min(5000000, Math.round(Number(input.priceFcfa) || 0))),
    depositMonths: Math.max(0, Math.min(12, Math.round(Number(input.depositMonths) || 0))),
    availableSpots: Math.max(1, Math.min(20, Math.round(Number(input.availableSpots) || 1))),
    roomsCount: Math.max(1, Math.min(30, Math.round(Number(input.roomsCount) || 1))),
    availability: cleanAvailability,
    amenities: cleanAmenities,
    photos: cleanPhotos,
    videos: cleanVideos,
    bathroomType: input.bathroomType,
    toiletType: input.toiletType,
    furnished: input.furnished,
    waterElectricity: input.waterElectricity,
    surfaceSqm: Math.max(0, Math.min(2000, Math.round(Number(input.surfaceSqm) || 0))),
    roommatePreference: input.roommatePreference,
    houseRules: clampText((input.houseRules || '').trim(), BLUEPRINT_LIMITS.HOUSE_RULES_MAX),
    updatedAt: serverTimestamp(),
  };
  if (mustRevalidate) {
    listingPatch.status = 'pending';
    listingPatch.isVerifiedQolock = false;
    listingPatch.isTop = false;
  }
  batch.update(doc(db, 'listings', listingId), listingPatch);

  batch.set(doc(db, 'listings', listingId, 'private', 'contact'), {
    ownerId,
    contactName: cleanContactName,
    contactPhone: cleanContactPhone || cleanContactWhatsapp || 'Non renseigné',
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'listings', listingId, 'private', 'verification'), {
    ownerId,
    contactName: cleanContactName,
    contactPhone: cleanContactPhone || cleanContactWhatsapp || 'Non renseigné',
    contactWhatsapp: cleanContactWhatsapp,
    depositorAddress: cleanDepositorAddress,
    depositorStatus: input.depositorStatus || 'proprietaire',
    authorizationNote:
      cleanAuthNote ||
      (input.depositorStatus === 'proprietaire'
        ? 'Déclaré comme propriétaire direct du logement.'
        : 'Autorisation déclarée par le déposant.'),
    updatedAt: serverTimestamp(),
  });

  if (mustRevalidate && !options?.isAdminEditor) {
    const alertId = generateId('alert');
    batch.set(doc(db, 'adminAlerts', alertId), {
      type: 'resubmitted_listing',
      listingId,
      listingTitle: cleanTitle,
      neighborhood: cleanNeighborhood,
      ownerId: user.uid,
      ownerName: cleanContactName,
      depositorStatus: input.depositorStatus || 'proprietaire',
      read: false,
      createdAt: serverTimestamp(),
    });
  }

  for (const { clipId, draft } of newClipsToSave) {
    batch.set(doc(db, 'listings', listingId, 'videoClips', clipId), {
      ownerId,
      title: sanitizeText(draft.title || 'Visite vidéo', BLUEPRINT_LIMITS.VIDEO_TITLE_MAX) || 'Visite vidéo',
      mimeType: draft.mimeType === 'video/mp4' ? 'video/mp4' : 'video/webm',
      dataUrl: draft.dataUrl,
      durationSec: Math.max(0, Math.min(BLUEPRINT_LIMITS.VIDEO_CLIP_MAX_SECONDS, Math.round(draft.durationSec || 0))),
      isPublic: true,
      createdAt: serverTimestamp(),
    });
  }

  for (const removedId of input.removedClipIds || []) {
    if (removedId) {
      batch.delete(doc(db, 'listings', listingId, 'videoClips', removedId));
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `listings/${listingId}`);
  }

  await logPlatformActivity(
    user,
    actorName,
    mustRevalidate && !options?.isAdminEditor
      ? 'Annonce modifiée et soumise pour validation'
      : 'Annonce modifiée',
    cleanTitle,
    'listing',
  );
}

export async function updateListingAvailabilityStatus(
  listing: Listing,
  nextStatus: 'published' | 'reserved' | 'rented',
  user: User,
  actorName: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'listings', listing.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `listings/${listing.id}`);
  }
  const actionLabel =
    nextStatus === 'reserved'
      ? 'Logement marqué réservé'
      : nextStatus === 'rented'
        ? 'Logement marqué loué / occupé'
        : 'Logement remis disponible';
  await logPlatformActivity(user, actorName, actionLabel, listing.title, 'listing');
}

export async function markListingAsRented(
  listing: Listing,
  user: User,
  actorName: string,
): Promise<void> {
  return updateListingAvailabilityStatus(listing, 'rented', user, actorName);
}

const ALLOWED_LISTING_KEYS = new Set([
  'title',
  'description',
  'neighborhood',
  'locationDetails',
  'propertyType',
  'priceFcfa',
  'depositMonths',
  'availableSpots',
  'roomsCount',
  'availability',
  'amenities',
  'photos',
  'videos',
  'bathroomType',
  'toiletType',
  'furnished',
  'waterElectricity',
  'surfaceSqm',
  'roommatePreference',
  'houseRules',
  'status',
  'moderationReason',
  'moderationHistory',
  'validatedByName',
  'validatedByEmail',
  'validatedAtIso',
  'isVerifiedQolock',
  'isTop',
  'topRequested',
  'ownerId',
  'ownerName',
  'createdAt',
  'updatedAt',
]);

const VALID_PROPERTY_TYPES = new Set<string>([
  'chambre',
  'maison',
  'appartement',
  'maison_partagee',
  'annexe',
  'studio',
  'colocation',
  'autre',
]);

const VALID_BATHROOM_TYPES = new Set<string>(['interne', 'externe', 'partagee']);
const VALID_TOILET_TYPES = new Set<string>(['interne', 'externe']);
const VALID_FURNISHED_TYPES = new Set<string>(['non_meuble', 'semi_meuble', 'meuble']);
const VALID_UTILITY_TYPES = new Set<string>(['inclus', 'compteur_individuel', 'partage']);
const VALID_ROOMMATE_PREFERENCES = new Set<string>([
  'mixte',
  'etudiants',
  'femmes',
  'hommes',
  'jeunes_actifs',
]);
const VALID_LISTING_STATUSES = new Set<string>([
  'pending',
  'in_review',
  'needs_correction',
  'published',
  'reserved',
  'rented',
  'rejected',
  'suspended',
]);

function normalizeHistoryListingStatus(rawStatus: unknown): ListingStatus {
  if (typeof rawStatus === 'string') {
    if (rawStatus === 'approved') return 'published';
    if (VALID_LISTING_STATUSES.has(rawStatus)) return rawStatus as ListingStatus;
  }
  return 'pending';
}

function sanitizeListingModerationHistory(
  history: unknown,
  fallbackActor: string,
  fallbackAtIso: string,
  maxItems: number,
): ListingModerationEntry[] {
  if (!Array.isArray(history)) return [];
  return history.slice(-maxItems).map((entry) => {
    const rec = (entry && typeof entry === 'object' ? entry : {}) as Partial<ListingModerationEntry>;
    const entryEmail = sanitizeText(String(rec.actorEmail || ''), BLUEPRINT_LIMITS.EMAIL_MAX);
    return {
      status: normalizeHistoryListingStatus(rec.status),
      reason:
        sanitizeText(String(rec.reason || 'Mise à jour'), BLUEPRINT_LIMITS.MODERATION_REASON_MAX) ||
        'Mise à jour',
      actorName:
        sanitizeText(String(rec.actorName || fallbackActor), BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
        fallbackActor,
      ...(entryEmail ? { actorEmail: entryEmail } : {}),
      atIso: sanitizeText(String(rec.atIso || fallbackAtIso), 40) || fallbackAtIso,
    };
  });
}

function buildSanitizedListingLegacyPatch(
  listing: Listing,
  fallbackActor: string,
  fallbackAtIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const key of Object.keys(listing)) {
    if (key !== 'id' && !ALLOWED_LISTING_KEYS.has(key)) {
      patch[key] = deleteField();
    }
  }

  if (
    !listing.title ||
    typeof listing.title !== 'string' ||
    listing.title.trim().length > BLUEPRINT_LIMITS.LISTING_TITLE_MAX
  ) {
    patch.title =
      sanitizeText(String(listing.title || 'Logement à Maradi'), BLUEPRINT_LIMITS.LISTING_TITLE_MAX) ||
      'Logement à Maradi';
  }
  if (typeof listing.description !== 'string') {
    patch.description = '';
  } else if (listing.description.length > BLUEPRINT_LIMITS.LISTING_DESC_MAX) {
    patch.description = clampText(listing.description, BLUEPRINT_LIMITS.LISTING_DESC_MAX);
  }
  if (
    !listing.neighborhood ||
    typeof listing.neighborhood !== 'string' ||
    listing.neighborhood.trim().length > BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX
  ) {
    patch.neighborhood =
      sanitizeText(String(listing.neighborhood || 'Maradi Centre'), BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX) ||
      'Maradi Centre';
  }
  if (
    listing.locationDetails !== undefined &&
    (typeof listing.locationDetails !== 'string' ||
      listing.locationDetails.length > BLUEPRINT_LIMITS.LOCATION_DETAILS_MAX)
  ) {
    patch.locationDetails = sanitizeText(
      String(listing.locationDetails || ''),
      BLUEPRINT_LIMITS.LOCATION_DETAILS_MAX,
    );
  }
  if (typeof listing.propertyType !== 'string' || !VALID_PROPERTY_TYPES.has(listing.propertyType)) {
    patch.propertyType = 'chambre';
  }
  if (
    typeof listing.priceFcfa !== 'number' ||
    !Number.isFinite(listing.priceFcfa) ||
    listing.priceFcfa < 0 ||
    listing.priceFcfa > 5000000
  ) {
    patch.priceFcfa = Math.max(0, Math.min(5000000, Math.round(Number(listing.priceFcfa) || 0)));
  }
  if (
    typeof listing.depositMonths !== 'number' ||
    !Number.isFinite(listing.depositMonths) ||
    listing.depositMonths < 0 ||
    listing.depositMonths > 12
  ) {
    patch.depositMonths = Math.max(0, Math.min(12, Math.round(Number(listing.depositMonths) || 1)));
  }
  if (
    typeof listing.availableSpots !== 'number' ||
    !Number.isFinite(listing.availableSpots) ||
    listing.availableSpots < 1 ||
    listing.availableSpots > 20
  ) {
    patch.availableSpots = Math.max(1, Math.min(20, Math.round(Number(listing.availableSpots) || 1)));
  }
  if (
    listing.roomsCount !== undefined &&
    (typeof listing.roomsCount !== 'number' ||
      !Number.isFinite(listing.roomsCount) ||
      listing.roomsCount < 1 ||
      listing.roomsCount > 30)
  ) {
    patch.roomsCount = Math.max(1, Math.min(30, Math.round(Number(listing.roomsCount) || 1)));
  }
  if (
    listing.availability !== undefined &&
    (typeof listing.availability !== 'string' ||
      listing.availability.length > BLUEPRINT_LIMITS.AVAILABILITY_MAX)
  ) {
    patch.availability = sanitizeText(
      String(listing.availability || 'Disponible immédiatement'),
      BLUEPRINT_LIMITS.AVAILABILITY_MAX,
    );
  }
  if (
    listing.surfaceSqm !== undefined &&
    (typeof listing.surfaceSqm !== 'number' ||
      !Number.isFinite(listing.surfaceSqm) ||
      listing.surfaceSqm < 0 ||
      listing.surfaceSqm > 2000)
  ) {
    patch.surfaceSqm = Math.max(0, Math.min(2000, Math.round(Number(listing.surfaceSqm) || 0)));
  }
  if (!Array.isArray(listing.amenities)) {
    patch.amenities = [];
  } else {
    const cleanAmenities = listing.amenities
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, BLUEPRINT_LIMITS.MAX_AMENITIES);
    if (cleanAmenities.length !== listing.amenities.length) {
      patch.amenities = cleanAmenities;
    }
  }
  if (!Array.isArray(listing.photos)) {
    patch.photos = [];
  } else {
    const cleanPhotos = listing.photos
      .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length <= 220000)
      .slice(0, BLUEPRINT_LIMITS.MAX_PHOTOS);
    if (cleanPhotos.length !== listing.photos.length) {
      patch.photos = cleanPhotos;
    }
  }
  if (listing.videos !== undefined) {
    if (!Array.isArray(listing.videos)) {
      patch.videos = [];
    } else {
      const cleanVideos: ListingVideo[] = listing.videos
        .slice(0, BLUEPRINT_LIMITS.MAX_VIDEOS)
        .filter((v): v is ListingVideo => Boolean(v && typeof v === 'object'))
        .map((v, idx) => {
          const sourceType: 'url' | 'clip' = v.sourceType === 'clip' ? 'clip' : 'url';
          return {
            id: sanitizeText(String(v.id || `vid_${idx + 1}`), 64) || `vid_${idx + 1}`,
            title: sanitizeText(String(v.title || 'Visite vidéo'), BLUEPRINT_LIMITS.VIDEO_TITLE_MAX),
            sourceType,
            url: sourceType === 'url' ? sanitizeText(String(v.url || ''), BLUEPRINT_LIMITS.VIDEO_URL_MAX) : '',
            clipId: sourceType === 'clip' ? sanitizeText(String(v.clipId || ''), BLUEPRINT_LIMITS.ID_MAX) : '',
            durationSec: Math.max(0, Math.min(3600, Math.round(Number(v.durationSec) || 0))),
          };
        });
      patch.videos = cleanVideos;
    }
  }
  if (
    listing.bathroomType !== undefined &&
    (typeof listing.bathroomType !== 'string' || !VALID_BATHROOM_TYPES.has(listing.bathroomType))
  ) {
    patch.bathroomType = 'interne';
  }
  if (
    listing.toiletType !== undefined &&
    (typeof listing.toiletType !== 'string' || !VALID_TOILET_TYPES.has(listing.toiletType))
  ) {
    patch.toiletType = 'interne';
  }
  if (
    listing.furnished !== undefined &&
    (typeof listing.furnished !== 'string' || !VALID_FURNISHED_TYPES.has(listing.furnished))
  ) {
    patch.furnished = 'non_meuble';
  }
  if (
    listing.waterElectricity !== undefined &&
    (typeof listing.waterElectricity !== 'string' ||
      !VALID_UTILITY_TYPES.has(listing.waterElectricity))
  ) {
    patch.waterElectricity = 'compteur_individuel';
  }
  if (
    listing.roommatePreference !== undefined &&
    (typeof listing.roommatePreference !== 'string' ||
      !VALID_ROOMMATE_PREFERENCES.has(listing.roommatePreference))
  ) {
    patch.roommatePreference = 'mixte';
  }
  if (
    listing.houseRules !== undefined &&
    (typeof listing.houseRules !== 'string' ||
      listing.houseRules.length > BLUEPRINT_LIMITS.HOUSE_RULES_MAX)
  ) {
    patch.houseRules = clampText(String(listing.houseRules || ''), BLUEPRINT_LIMITS.HOUSE_RULES_MAX);
  }
  if (
    listing.moderationReason !== undefined &&
    (typeof listing.moderationReason !== 'string' ||
      listing.moderationReason.length > BLUEPRINT_LIMITS.MODERATION_REASON_MAX)
  ) {
    patch.moderationReason = sanitizeText(
      String(listing.moderationReason || ''),
      BLUEPRINT_LIMITS.MODERATION_REASON_MAX,
    );
  }
  if (listing.moderationHistory !== undefined) {
    patch.moderationHistory = sanitizeListingModerationHistory(
      listing.moderationHistory,
      fallbackActor,
      fallbackAtIso,
      BLUEPRINT_LIMITS.MODERATION_HISTORY_MAX,
    );
  }
  if (
    listing.validatedByName !== undefined &&
    (typeof listing.validatedByName !== 'string' ||
      listing.validatedByName.length > BLUEPRINT_LIMITS.DISPLAY_NAME_MAX)
  ) {
    patch.validatedByName = sanitizeText(
      String(listing.validatedByName || fallbackActor),
      BLUEPRINT_LIMITS.DISPLAY_NAME_MAX,
    );
  }
  if (
    listing.validatedByEmail !== undefined &&
    (typeof listing.validatedByEmail !== 'string' ||
      listing.validatedByEmail.length > BLUEPRINT_LIMITS.EMAIL_MAX)
  ) {
    patch.validatedByEmail = sanitizeText(
      String(listing.validatedByEmail || ''),
      BLUEPRINT_LIMITS.EMAIL_MAX,
    );
  }
  if (
    listing.validatedAtIso !== undefined &&
    (typeof listing.validatedAtIso !== 'string' || listing.validatedAtIso.length > 40)
  ) {
    patch.validatedAtIso = sanitizeText(String(listing.validatedAtIso || fallbackAtIso), 40);
  }
  if (typeof listing.isVerifiedQolock !== 'boolean') {
    patch.isVerifiedQolock = false;
  }
  if (typeof listing.isTop !== 'boolean') {
    patch.isTop = false;
  }
  if (typeof listing.topRequested !== 'boolean') {
    patch.topRequested = false;
  }
  if (
    !listing.ownerName ||
    typeof listing.ownerName !== 'string' ||
    listing.ownerName.trim().length > BLUEPRINT_LIMITS.DISPLAY_NAME_MAX
  ) {
    patch.ownerName =
      sanitizeText(String(listing.ownerName || 'Propriétaire'), BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
      'Propriétaire';
  }

  return patch;
}

export async function adminModerateListing(
  listing: Listing,
  decision: {
    status?: ListingStatus;
    reason?: string;
    isVerifiedQolock?: boolean;
    isTop?: boolean;
    topRequested?: boolean;
  },
  adminUser: User,
  adminName: string,
): Promise<void> {
  if (!listing.ownerId || !isValidFirestoreId(listing.ownerId) || !listing.createdAt) {
    throw new Error(
      'Ce document annonce est incomplet dans la base (identifiant propriétaire ou date de création manquant).',
    );
  }

  const cleanAdmin = sanitizeText(adminName || 'Administrateur', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Administrateur';
  const rawAdminEmail = (adminUser.email || '').trim().toLowerCase();
  const cleanAdminEmail =
    rawAdminEmail && !/^wa\.\d+@qolock\.app$/i.test(rawAdminEmail)
      ? sanitizeText(rawAdminEmail, BLUEPRINT_LIMITS.EMAIL_MAX)
      : '';
  const nextStatus = decision.status ?? listing.status;
  const cleanReason = sanitizeText(decision.reason || '', BLUEPRINT_LIMITS.MODERATION_REASON_MAX);
  const nowIso = new Date().toISOString().slice(0, 30);

  const patch: Record<string, unknown> = {
    ...buildSanitizedListingLegacyPatch(listing, cleanAdmin, nowIso),
    updatedAt: serverTimestamp(),
  };

  if (typeof decision.status === 'string') {
    patch.status = decision.status;
  }
  if (typeof decision.isVerifiedQolock === 'boolean') {
    patch.isVerifiedQolock = decision.isVerifiedQolock;
  }
  if (typeof decision.isTop === 'boolean') {
    patch.isTop = decision.isTop;
  }
  if (typeof decision.topRequested === 'boolean') {
    patch.topRequested = decision.topRequested;
  }

  let historyReason = cleanReason;
  if (
    decision.status === 'rejected' ||
    decision.status === 'suspended' ||
    decision.status === 'needs_correction'
  ) {
    const fallbackReason =
      decision.status === 'suspended'
        ? 'Annonce suspendue par l’administration GidaColocs.'
        : decision.status === 'needs_correction'
          ? 'Merci de compléter les informations ou photos de votre annonce.'
          : 'Annonce refusée : informations ou photos non conformes.';
    const finalReason = cleanReason || fallbackReason;
    patch.moderationReason = finalReason;
    historyReason = finalReason;
  } else if (
    decision.status === 'in_review' ||
    decision.status === 'published' ||
    decision.status === 'reserved' ||
    decision.status === 'rented'
  ) {
    patch.moderationReason = '';
    historyReason =
      cleanReason ||
      (decision.status === 'in_review'
        ? 'Vérification en cours par l’administrateur'
        : decision.status === 'rented'
          ? 'Logement marqué loué / occupé'
          : decision.status === 'reserved'
            ? 'Logement marqué réservé'
            : 'Annonce approuvée et publiée');
  }

  if (
    typeof decision.status === 'string' &&
    (decision.status === 'published' ||
      decision.status === 'rejected' ||
      decision.status === 'needs_correction' ||
      decision.status === 'suspended')
  ) {
    patch.validatedByName = cleanAdmin;
    patch.validatedByEmail = cleanAdminEmail;
    patch.validatedAtIso = nowIso;
  }

  if (typeof decision.status === 'string' && decision.status !== listing.status) {
    const sanitizedExisting = sanitizeListingModerationHistory(
      listing.moderationHistory,
      cleanAdmin,
      nowIso,
      BLUEPRINT_LIMITS.MODERATION_HISTORY_MAX - 1,
    );

    const newEntry: ListingModerationEntry = {
      status: nextStatus,
      reason: sanitizeText(historyReason || `Statut : ${nextStatus}`, BLUEPRINT_LIMITS.MODERATION_REASON_MAX) || `Statut : ${nextStatus}`,
      actorName: cleanAdmin,
      ...(cleanAdminEmail ? { actorEmail: cleanAdminEmail } : {}),
      atIso: nowIso,
    };

    patch.moderationHistory = [...sanitizedExisting, newEntry];
  }

  try {
    await updateDoc(doc(db, 'listings', listing.id), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `listings/${listing.id}`);
  }

  const statusChanged = typeof decision.status === 'string' && decision.status !== listing.status;
  if (
    statusChanged &&
    listing.ownerId &&
    isValidFirestoreId(listing.ownerId) &&
    (nextStatus === 'in_review' ||
      nextStatus === 'needs_correction' ||
      nextStatus === 'published' ||
      nextStatus === 'rejected' ||
      nextStatus === 'suspended')
  ) {
    const notifId = generateId('notif');
    const title =
      nextStatus === 'published'
        ? 'Annonce approuvée et publiée'
        : nextStatus === 'in_review'
          ? 'Annonce en cours de vérification'
          : nextStatus === 'needs_correction'
            ? 'Corrections demandées sur votre annonce'
            : nextStatus === 'suspended'
              ? 'Annonce suspendue'
              : 'Annonce refusée';
    const message =
      nextStatus === 'published'
        ? `Votre logement « ${listing.title} » a été validé par GidaColocs et est désormais visible publiquement.`
        : nextStatus === 'in_review'
          ? `L’équipe GidaColocs examine actuellement votre annonce « ${listing.title} ». Vous serez notifié dès la décision finale.`
          : nextStatus === 'needs_correction'
            ? `Votre annonce « ${listing.title} » nécessite une correction : ${historyReason}. Modifiez-la depuis « Mon espace ».`
            : nextStatus === 'suspended'
              ? `Votre annonce « ${listing.title} » a été suspendue. Motif : ${historyReason}`
              : `Votre annonce « ${listing.title} » a été refusée. Motif : ${historyReason}. Vous pouvez la corriger depuis « Mon espace ».`;
    try {
      await setDoc(
        doc(db, 'notifications', notifId),
        buildNotificationDoc(listing.ownerId, 'listing', title, message, listing.id),
      );
    } catch (notifError) {
      console.warn(`Non-fatal notification write warning at notifications/${notifId}:`, notifError);
    }
  }

  const activityAction =
    statusChanged && nextStatus === 'published'
      ? 'Annonce approuvée'
      : statusChanged && nextStatus === 'in_review'
        ? 'Annonce passée en vérification'
        : statusChanged && nextStatus === 'needs_correction'
          ? 'Corrections demandées'
          : statusChanged && nextStatus === 'rejected'
            ? 'Annonce refusée'
            : statusChanged && nextStatus === 'suspended'
              ? 'Annonce suspendue'
              : 'Modération annonce';

  await logPlatformActivity(
    adminUser,
    adminName,
    activityAction,
    historyReason &&
      statusChanged &&
      (nextStatus === 'rejected' || nextStatus === 'suspended' || nextStatus === 'needs_correction')
      ? `${listing.title} · ${historyReason}`
      : listing.title,
    'listing',
  );
}

export async function adminUpdateListingStatusAndBadges(
  listing: Listing,
  patch: { status?: ListingStatus; isVerifiedQolock?: boolean; isTop?: boolean; topRequested?: boolean },
  user: User,
  actorName: string,
): Promise<void> {
  return adminModerateListing(listing, patch, user, actorName);
}

export async function deleteListingById(
  listing: Listing,
  user: User,
  actorName: string,
): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const v of listing.videos || []) {
      if (v.sourceType === 'clip' && v.clipId) {
        batch.delete(doc(db, 'listings', listing.id, 'videoClips', v.clipId));
      }
    }
    batch.delete(doc(db, 'listings', listing.id, 'private', 'contact'));
    batch.delete(doc(db, 'listings', listing.id, 'private', 'verification'));
    batch.delete(doc(db, 'listings', listing.id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `listings/${listing.id}`);
  }
  await logPlatformActivity(user, actorName, 'Logement enlevé / supprimé', listing.title, 'listing');
}

export async function adminRemoveAllRentedListings(
  rentedListings: Listing[],
  adminUser: User,
  adminName: string,
): Promise<number> {
  if (rentedListings.length === 0) return 0;

  let removedCount = 0;
  let batch = writeBatch(db);
  let opsInBatch = 0;

  const commitBatch = async () => {
    if (opsInBatch === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    opsInBatch = 0;
  };

  try {
    for (const listing of rentedListings) {
      const clipRefs = (listing.videos || [])
        .filter((v) => v.sourceType === 'clip' && Boolean(v.clipId))
        .map((v) => doc(db, 'listings', listing.id, 'videoClips', v.clipId));
      const neededOps = 3 + clipRefs.length;
      if (opsInBatch + neededOps > 400) {
        await commitBatch();
      }
      for (const clipRef of clipRefs) {
        batch.delete(clipRef);
      }
      batch.delete(doc(db, 'listings', listing.id, 'private', 'contact'));
      batch.delete(doc(db, 'listings', listing.id, 'private', 'verification'));
      batch.delete(doc(db, 'listings', listing.id));
      opsInBatch += neededOps;
      removedCount += 1;
    }
    await commitBatch();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'listings (bulk cleanup)');
  }

  await logPlatformActivity(
    adminUser,
    adminName,
    `Nettoyage : ${removedCount} logement(s) pris enlevé(s)`,
    `${removedCount} annonce(s) supprimée(s)`,
    'listing',
  );
  return removedCount;
}

export async function fetchListingPrivateContact(
  listingId: string,
): Promise<ListingPrivateContact | null> {
  const path = `listings/${listingId}/private/contact`;
  try {
    const snap = await getDoc(doc(db, 'listings', listingId, 'private', 'contact'));
    if (!snap.exists()) return null;
    return snap.data() as ListingPrivateContact;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchListingPrivateVerification(
  listingId: string,
): Promise<ListingPrivateVerification | null> {
  const path = `listings/${listingId}/private/verification`;
  try {
    const snap = await getDoc(doc(db, 'listings', listingId, 'private', 'verification'));
    if (!snap.exists()) return null;
    return snap.data() as ListingPrivateVerification;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function markAdminAlertRead(alertId: string): Promise<void> {
  const path = `adminAlerts/${alertId}`;
  try {
    await updateDoc(doc(db, 'adminAlerts', alertId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllAdminAlertsRead(alertIds: string[]): Promise<void> {
  const targets = alertIds.filter(Boolean).slice(0, 100);
  if (targets.length === 0) return;
  const batch = writeBatch(db);
  for (const id of targets) {
    batch.update(doc(db, 'adminAlerts', id), { read: true });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'adminAlerts (batch read)');
  }
}

export async function confirmRentalForTenant(
  listing: Listing,
  input: {
    tenantId: string;
    tenantName: string;
    tenantPhone?: string;
    welcomeMessage?: string;
  },
  adminUser: User,
  adminName: string,
): Promise<string> {
  const cleanTenantId = sanitizeText(input.tenantId, BLUEPRINT_LIMITS.ID_MAX);
  const cleanTenantName = sanitizeText(input.tenantName, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
  if (!cleanTenantId || !isValidFirestoreId(cleanTenantId) || !cleanTenantName) {
    throw new Error('Sélectionnez le locataire concerné pour confirmer la location.');
  }

  const confId = generateId('conf');
  const nowIso = new Date().toISOString().slice(0, 30);
  const cleanAdmin = sanitizeText(adminName || 'Administrateur', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Administrateur';
  const rawAdminEmail = (adminUser.email || '').trim().toLowerCase();
  const cleanAdminEmail =
    rawAdminEmail && !/^wa\.\d+@qolock\.app$/i.test(rawAdminEmail)
      ? sanitizeText(rawAdminEmail, BLUEPRINT_LIMITS.EMAIL_MAX)
      : '';
  const cleanTitle =
    sanitizeText(String(listing.title || 'Logement à Maradi'), BLUEPRINT_LIMITS.LISTING_TITLE_MAX) ||
    'Logement à Maradi';
  const cleanNeighborhood =
    sanitizeText(String(listing.neighborhood || 'Maradi Centre'), BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX) ||
    'Maradi Centre';
  const cleanOwnerName =
    sanitizeText(String(listing.ownerName || 'Propriétaire'), BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
    'Propriétaire';
  const safePrice = Math.max(0, Math.min(5000000, Math.round(Number(listing.priceFcfa) || 0)));
  const safeLandlordId =
    listing.ownerId && isValidFirestoreId(listing.ownerId) ? listing.ownerId : adminUser.uid;

  const cleanWelcome =
    sanitizeText(
      input.welcomeMessage || '',
      BLUEPRINT_LIMITS.WELCOME_MESSAGE_MAX,
    ) ||
    `Félicitations ${cleanTenantName} ! Votre location pour « ${cleanTitle} » (${cleanNeighborhood}) est officiellement confirmée sur GidaColocs. Bienvenue dans la communauté !`;

  const sanitizedExisting = sanitizeListingModerationHistory(
    listing.moderationHistory,
    cleanAdmin,
    nowIso,
    BLUEPRINT_LIMITS.MODERATION_HISTORY_MAX - 1,
  );

  const nextHistory: ListingModerationEntry[] = [
    ...sanitizedExisting,
    {
      status: 'rented',
      reason:
        sanitizeText(`Location confirmée avec ${cleanTenantName}`, BLUEPRINT_LIMITS.MODERATION_REASON_MAX) ||
        'Location confirmée',
      actorName: cleanAdmin,
      ...(cleanAdminEmail ? { actorEmail: cleanAdminEmail } : {}),
      atIso: nowIso,
    },
  ];

  const confPayload: Record<string, unknown> = {
    listingId: listing.id,
    listingTitle: cleanTitle,
    neighborhood: cleanNeighborhood,
    priceFcfa: safePrice,
    tenantId: cleanTenantId,
    tenantName: cleanTenantName,
    landlordId: safeLandlordId,
    landlordName: cleanOwnerName,
    welcomeMessage: cleanWelcome,
    confirmedById: adminUser.uid,
    confirmedByName: cleanAdmin,
    ...(cleanAdminEmail ? { confirmedByEmail: cleanAdminEmail } : {}),
    confirmedAtIso: nowIso,
    createdAt: serverTimestamp(),
  };
  if (input.tenantPhone?.trim()) {
    confPayload.tenantPhone = sanitizeText(input.tenantPhone, BLUEPRINT_LIMITS.PHONE_MAX);
  }

  try {
    await setDoc(doc(db, 'rentalConfirmations', confId), confPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rentalConfirmations/${confId}`);
  }

  const listingPatch: Record<string, unknown> = {
    ...buildSanitizedListingLegacyPatch(listing, cleanAdmin, nowIso),
    status: 'rented',
    moderationReason: '',
    moderationHistory: nextHistory,
    validatedByName: cleanAdmin,
    validatedByEmail: cleanAdminEmail,
    validatedAtIso: nowIso,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'listings', listing.id), listingPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `listings/${listing.id}`);
  }

  const tenantNotifId = generateId('notif');
  try {
    await setDoc(
      doc(db, 'notifications', tenantNotifId),
      buildNotificationDoc(
        cleanTenantId,
        'listing',
        'Location confirmée sur GidaColocs',
        `${cleanWelcome} Rejoignez notre communauté WhatsApp depuis votre espace personnel.`,
        confId,
      ),
    );
  } catch (notifError) {
    console.warn(`Non-fatal tenant notification warning at notifications/${tenantNotifId}:`, notifError);
  }

  if (listing.ownerId && isValidFirestoreId(listing.ownerId) && listing.ownerId !== cleanTenantId) {
    const ownerNotifId = generateId('notif');
    try {
      await setDoc(
        doc(db, 'notifications', ownerNotifId),
        buildNotificationDoc(
          listing.ownerId,
          'listing',
          'Logement confirmé comme loué',
          `Votre logement « ${cleanTitle} » est désormais confirmé comme loué avec ${cleanTenantName}.`,
          listing.id,
        ),
      );
    } catch (notifError) {
      console.warn(`Non-fatal owner notification warning at notifications/${ownerNotifId}:`, notifError);
    }
  }

  await logPlatformActivity(
    adminUser,
    adminName,
    'Location confirmée (Pris / Loué)',
    `${cleanTitle} · ${cleanTenantName}`,
    'rental',
  );
  return confId;
}

export async function fetchListingVideoClip(
  listingId: string,
  clipId: string,
): Promise<ListingVideoClip | null> {
  const path = `listings/${listingId}/videoClips/${clipId}`;
  try {
    const snap = await getDoc(doc(db, 'listings', listingId, 'videoClips', clipId));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<ListingVideoClip, 'id'>),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function upsertListingColocInterest(
  listingId: string,
  listingTitle: string,
  input: {
    occupation: string;
    habits: string;
    budgetFcfa: number;
    message: string;
  },
  user: User,
  actorName: string,
  isExisting: boolean,
  neighborhood = 'Maradi',
): Promise<void> {
  const path = `listings/${listingId}/colocInterests/${user.uid}`;
  const cleanOccupation = sanitizeText(input.occupation, BLUEPRINT_LIMITS.COLOC_OCCUPATION_MAX);
  const cleanHabits = sanitizeText(input.habits, BLUEPRINT_LIMITS.COLOC_LIFESTYLE_MAX);
  const cleanMessage = sanitizeText(input.message, BLUEPRINT_LIMITS.COLOC_MESSAGE_MAX);
  if (!cleanOccupation || !cleanHabits || !cleanMessage) {
    throw new Error('Veuillez renseigner votre profil, vos habitudes et votre message.');
  }

  const cleanActor =
    sanitizeText(actorName || 'Étudiant', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Étudiant';
  const cleanListingTitle =
    sanitizeText(listingTitle || 'Logement colocation', BLUEPRINT_LIMITS.LISTING_TITLE_MAX) ||
    'Logement colocation';
  const cleanNeighborhood =
    sanitizeText(neighborhood || 'Maradi', BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX) || 'Maradi';
  const cleanBudget = Math.max(0, Math.min(5000000, Math.round(Number(input.budgetFcfa) || 0)));

  const batch = writeBatch(db);
  const ref = doc(db, 'listings', listingId, 'colocInterests', user.uid);
  if (isExisting) {
    batch.update(ref, {
      listingId,
      listingTitle: cleanListingTitle,
      userName: cleanActor,
      occupation: cleanOccupation,
      habits: cleanHabits,
      budgetFcfa: cleanBudget,
      message: cleanMessage,
      isPublic: false,
      moderationStatus: 'pending' as ContentModerationStatus,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(ref, {
      listingId,
      listingTitle: cleanListingTitle,
      userId: user.uid,
      userName: cleanActor,
      occupation: cleanOccupation,
      habits: cleanHabits,
      budgetFcfa: cleanBudget,
      message: cleanMessage,
      isPublic: false,
      moderationStatus: 'pending' as ContentModerationStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const alertId = generateId('alert');
  batch.set(doc(db, 'adminAlerts', alertId), {
    type: 'new_coloc_request',
    listingId,
    listingTitle: cleanListingTitle,
    neighborhood: cleanNeighborhood,
    ownerId: user.uid,
    ownerName: cleanActor,
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, isExisting ? OperationType.UPDATE : OperationType.CREATE, path);
  }

  await logPlatformActivity(
    user,
    actorName,
    'Demande de colocation soumise pour validation',
    cleanListingTitle,
    'coloc',
  );
}

export async function removeListingColocInterest(
  listingId: string,
  listingTitle: string,
  user: User,
  actorName: string,
): Promise<void> {
  const path = `listings/${listingId}/colocInterests/${user.uid}`;
  try {
    await deleteDoc(doc(db, 'listings', listingId, 'colocInterests', user.uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
  await logPlatformActivity(user, actorName, 'Retrait espace colocation', listingTitle, 'coloc');
}

export async function createColocProfile(
  input: {
    targetNeighborhood: string;
    desiredType: ColocDesiredType;
    maxBudgetFcfa: number;
    occupation: string;
    genderPreference: ColocGenderPreference;
    lifestyle: string;
    bio: string;
    linkedListingId?: string;
  },
  user: User,
  actorName: string,
): Promise<string> {
  const profileId = generateId('coloc');
  const cleanOccupation = sanitizeText(input.occupation, BLUEPRINT_LIMITS.COLOC_OCCUPATION_MAX);
  const cleanLifestyle = sanitizeText(input.lifestyle, BLUEPRINT_LIMITS.COLOC_LIFESTYLE_MAX);
  const cleanBio = sanitizeText(input.bio, BLUEPRINT_LIMITS.COLOC_BIO_MAX);
  if (!cleanOccupation || !cleanLifestyle || !cleanBio) {
    throw new Error('Veuillez compléter votre profil, votre mode de vie et votre présentation.');
  }

  const cleanActor =
    sanitizeText(actorName || 'Colocataire', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Colocataire';
  const cleanNeighborhood =
    sanitizeText(input.targetNeighborhood || 'Zone UDM', BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX) ||
    'Zone UDM';
  const cleanAlertTitle =
    sanitizeText(`Profil coloc — ${cleanNeighborhood}`, BLUEPRINT_LIMITS.LISTING_TITLE_MAX) ||
    'Profil colocataire';

  const path = `colocProfiles/${profileId}`;
  const batch = writeBatch(db);
  batch.set(doc(db, 'colocProfiles', profileId), {
    authorId: user.uid,
    authorName: cleanActor,
    targetNeighborhood: cleanNeighborhood,
    desiredType: input.desiredType,
    maxBudgetFcfa: Math.max(0, Math.min(5000000, Math.round(Number(input.maxBudgetFcfa) || 0))),
    occupation: cleanOccupation,
    genderPreference: input.genderPreference,
    lifestyle: cleanLifestyle,
    bio: cleanBio,
    linkedListingId: sanitizeText(input.linkedListingId || '', BLUEPRINT_LIMITS.ID_MAX),
    status: 'active' as ColocProfileStatus,
    isPublic: false,
    moderationStatus: 'pending' as ContentModerationStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const alertId = generateId('alert');
  batch.set(doc(db, 'adminAlerts', alertId), {
    type: 'new_coloc_profile',
    listingId: profileId,
    listingTitle: cleanAlertTitle,
    neighborhood: cleanNeighborhood,
    ownerId: user.uid,
    ownerName: cleanActor,
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  await logPlatformActivity(
    user,
    actorName,
    'Profil colocataire soumis pour validation',
    `${cleanNeighborhood} · ${cleanOccupation}`,
    'coloc',
  );
  return profileId;
}

export async function updateColocProfileDetails(
  profileId: string,
  input: {
    targetNeighborhood: string;
    desiredType: ColocDesiredType;
    maxBudgetFcfa: number;
    occupation: string;
    genderPreference: ColocGenderPreference;
    lifestyle: string;
    bio: string;
    linkedListingId?: string;
  },
  user: User,
  actorName: string,
): Promise<void> {
  const cleanOccupation = sanitizeText(input.occupation, BLUEPRINT_LIMITS.COLOC_OCCUPATION_MAX);
  const cleanLifestyle = sanitizeText(input.lifestyle, BLUEPRINT_LIMITS.COLOC_LIFESTYLE_MAX);
  const cleanBio = sanitizeText(input.bio, BLUEPRINT_LIMITS.COLOC_BIO_MAX);
  if (!cleanOccupation || !cleanLifestyle || !cleanBio) {
    throw new Error('Veuillez compléter votre profil, votre mode de vie et votre présentation.');
  }

  const cleanActor =
    sanitizeText(actorName || 'Colocataire', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Colocataire';
  const cleanNeighborhood =
    sanitizeText(input.targetNeighborhood || 'Zone UDM', BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX) ||
    'Zone UDM';
  const cleanAlertTitle =
    sanitizeText(`Profil coloc — ${cleanNeighborhood}`, BLUEPRINT_LIMITS.LISTING_TITLE_MAX) ||
    'Profil colocataire';

  const path = `colocProfiles/${profileId}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'colocProfiles', profileId), {
    targetNeighborhood: cleanNeighborhood,
    desiredType: input.desiredType,
    maxBudgetFcfa: Math.max(0, Math.min(5000000, Math.round(Number(input.maxBudgetFcfa) || 0))),
    occupation: cleanOccupation,
    genderPreference: input.genderPreference,
    lifestyle: cleanLifestyle,
    bio: cleanBio,
    linkedListingId: sanitizeText(input.linkedListingId || '', BLUEPRINT_LIMITS.ID_MAX),
    status: 'active' as ColocProfileStatus,
    isPublic: false,
    moderationStatus: 'pending' as ContentModerationStatus,
    updatedAt: serverTimestamp(),
  });

  const alertId = generateId('alert');
  batch.set(doc(db, 'adminAlerts', alertId), {
    type: 'resubmitted_coloc_profile',
    listingId: profileId,
    listingTitle: cleanAlertTitle,
    neighborhood: cleanNeighborhood,
    ownerId: user.uid,
    ownerName: cleanActor,
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  await logPlatformActivity(
    user,
    actorName,
    'Profil colocataire modifié et resoumis pour validation',
    `${cleanNeighborhood} · ${cleanOccupation}`,
    'coloc',
  );
}

export async function updateColocProfileStatus(
  profileId: string,
  status: ColocProfileStatus,
  user: User,
  actorName: string,
): Promise<void> {
  const path = `colocProfiles/${profileId}`;
  try {
    await updateDoc(doc(db, 'colocProfiles', profileId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  await logPlatformActivity(user, actorName, `Statut colocation : ${status}`, profileId, 'coloc');
}

export async function deleteColocProfile(
  profileId: string,
  user: User,
  actorName: string,
): Promise<void> {
  const path = `colocProfiles/${profileId}`;
  try {
    await deleteDoc(doc(db, 'colocProfiles', profileId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
  await logPlatformActivity(user, actorName, 'Annonce colocation supprimée', profileId, 'coloc');
}

export async function postColocMessage(
  profileId: string,
  profileAuthorId: string,
  message: string,
  user: User,
  actorName: string,
): Promise<void> {
  const messageId = generateId('msg');
  const cleanMsg = sanitizeText(message, BLUEPRINT_LIMITS.COLOC_MESSAGE_MAX);
  if (!cleanMsg) throw new Error('Le message ne peut pas être vide.');
  const cleanActor =
    sanitizeText(actorName || 'Utilisateur', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Utilisateur';
  const path = `colocProfiles/${profileId}/messages/${messageId}`;
  const batch = writeBatch(db);
  batch.set(doc(db, 'colocProfiles', profileId, 'messages', messageId), {
    profileId,
    profileAuthorId,
    authorId: user.uid,
    authorName: cleanActor,
    message: cleanMsg,
    isPublic: false,
    moderationStatus: 'pending' as ContentModerationStatus,
    createdAt: serverTimestamp(),
  });
  const alertId = generateId('alert');
  batch.set(doc(db, 'adminAlerts', alertId), {
    type: 'new_comment',
    listingId: profileId,
    listingTitle: sanitizeText(cleanMsg, 120) || 'Commentaire colocation',
    neighborhood: 'Colocation',
    ownerId: user.uid,
    ownerName: cleanActor,
    read: false,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  await logPlatformActivity(user, actorName, 'Commentaire colocation soumis pour validation', cleanMsg.slice(0, 80), 'coloc');
}

export async function submitListingReview(
  listingId: string,
  listingTitle: string,
  neighborhood: string,
  rating: number,
  comment: string,
  user: User,
  actorName: string,
  existingReviewId?: string,
): Promise<string> {
  const cleanComment = sanitizeText(comment, BLUEPRINT_LIMITS.REVIEW_COMMENT_MAX);
  if (!cleanComment) throw new Error('Rédigez votre avis avant de l’envoyer.');

  const safeRating = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)));
  const cleanActor =
    sanitizeText(actorName || 'Membre GidaColocs', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
    'Membre GidaColocs';
  const cleanListingTitle =
    sanitizeText(listingTitle || 'Logement', BLUEPRINT_LIMITS.LISTING_TITLE_MAX) || 'Logement';
  const cleanNeighborhood =
    sanitizeText(neighborhood || 'Maradi', BLUEPRINT_LIMITS.NEIGHBORHOOD_MAX) || 'Maradi';
  const reviewId = existingReviewId || generateId('rev');
  const path = `listings/${listingId}/reviews/${reviewId}`;

  const batch = writeBatch(db);
  const reviewRef = doc(db, 'listings', listingId, 'reviews', reviewId);
  if (existingReviewId) {
    batch.update(reviewRef, {
      authorName: cleanActor,
      rating: safeRating,
      comment: cleanComment,
      isPublic: false,
      moderationStatus: 'pending' as ContentModerationStatus,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(reviewRef, {
      listingId,
      listingTitle: cleanListingTitle,
      authorId: user.uid,
      authorName: cleanActor,
      rating: safeRating,
      comment: cleanComment,
      isPublic: false,
      moderationStatus: 'pending' as ContentModerationStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const alertId = generateId('alert');
  batch.set(doc(db, 'adminAlerts', alertId), {
    type: 'new_review',
    listingId,
    listingTitle: cleanListingTitle,
    neighborhood: cleanNeighborhood,
    ownerId: user.uid,
    ownerName: cleanActor,
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, existingReviewId ? OperationType.UPDATE : OperationType.CREATE, path);
  }

  await logPlatformActivity(
    user,
    actorName,
    existingReviewId ? 'Avis modifié et soumis pour validation' : 'Avis soumis pour validation',
    cleanListingTitle,
    'review',
  );
  return reviewId;
}

export async function deleteListingReview(
  listingId: string,
  reviewId: string,
  listingTitle: string,
  user: User,
  actorName: string,
): Promise<void> {
  const path = `listings/${listingId}/reviews/${reviewId}`;
  try {
    await deleteDoc(doc(db, 'listings', listingId, 'reviews', reviewId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
  await logPlatformActivity(user, actorName, 'Avis supprimé', listingTitle, 'review');
}

function buildModerationDecisionPayload(
  existingHistory: ContentModerationEntry[] | undefined,
  decision: Exclude<ContentModerationStatus, 'pending'>,
  reason: string,
  adminUser: User,
  adminName: string,
  defaultApprovedReason: string,
) {
  const trimmedReason = reason.trim();
  if ((decision === 'rejected' || decision === 'needs_correction') && !trimmedReason) {
    throw new Error('Un motif explicatif est obligatoire pour refuser ou demander une correction.');
  }
  const cleanAdmin =
    sanitizeText(adminName || 'Administrateur GidaColocs', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) ||
    'Administrateur GidaColocs';
  const rawEmail = (adminUser.email || '').trim().toLowerCase();
  const cleanEmail =
    rawEmail && !/^wa\.\d+@qolock\.app$/i.test(rawEmail)
      ? sanitizeText(rawEmail, BLUEPRINT_LIMITS.EMAIL_MAX)
      : '';
  const nowIso = new Date().toISOString().slice(0, 30);
  const cleanReason =
    sanitizeText(
      decision === 'approved' ? trimmedReason || defaultApprovedReason : trimmedReason,
      300,
    ) || defaultApprovedReason;
  const sanitizedHistory: ContentModerationEntry[] = (Array.isArray(existingHistory)
    ? existingHistory
    : []
  )
    .slice(-11)
    .map((h) => {
      const hEmail = sanitizeText(String(h?.actorEmail || ''), BLUEPRINT_LIMITS.EMAIL_MAX);
      return {
        status: (h?.status || 'pending') as ContentModerationStatus,
        reason: sanitizeText(String(h?.reason || 'Mise à jour'), 300) || 'Mise à jour',
        actorName: sanitizeText(String(h?.actorName || cleanAdmin), BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || cleanAdmin,
        ...(hEmail ? { actorEmail: hEmail } : {}),
        atIso: sanitizeText(String(h?.atIso || nowIso), 40) || nowIso,
      };
    });
  const entry: ContentModerationEntry = {
    status: decision,
    reason: cleanReason,
    actorName: cleanAdmin,
    ...(cleanEmail ? { actorEmail: cleanEmail } : {}),
    atIso: nowIso,
  };
  const nextHistory: ContentModerationEntry[] = [
    ...sanitizedHistory,
    entry,
  ];
  return {
    cleanAdmin,
    nowIso,
    cleanReason,
    nextHistory,
    patch: {
      isPublic: decision === 'approved',
      moderationStatus: decision,
      moderationReason: cleanReason,
      moderationHistory: nextHistory,
      validatedByName: cleanAdmin,
      validatedAtIso: nowIso,
    },
  };
}

export async function adminModerateColocProfile(
  profileItem: ColocProfile,
  decision: Exclude<ContentModerationStatus, 'pending'>,
  reason: string,
  adminUser: User,
  adminName: string,
): Promise<void> {
  const { patch, cleanReason } = buildModerationDecisionPayload(
    profileItem.moderationHistory,
    decision,
    reason,
    adminUser,
    adminName,
    'Profil colocataire validé par l’administrateur',
  );
  const batch = writeBatch(db);
  batch.update(doc(db, 'colocProfiles', profileItem.id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  if (
    profileItem.authorId &&
    isValidFirestoreId(profileItem.authorId) &&
    profileItem.authorId !== adminUser.uid
  ) {
    const notifTitle =
      decision === 'approved'
        ? 'Profil colocataire approuvé'
        : decision === 'needs_correction'
          ? 'Correction demandée sur votre profil colocation'
          : 'Profil colocataire refusé';
    const notifMessage =
      decision === 'approved'
        ? `Votre profil colocataire (${profileItem.targetNeighborhood}) est maintenant visible publiquement.`
        : `Votre profil colocataire (${profileItem.targetNeighborhood}) : ${cleanReason}`;
    batch.set(
      doc(db, 'notifications', generateId('notif')),
      buildNotificationDoc(profileItem.authorId, 'coloc', notifTitle, notifMessage, profileItem.id),
    );
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `colocProfiles/${profileItem.id}`);
  }
  await logPlatformActivity(
    adminUser,
    adminName,
    `Profil colocation ${decision}`,
    `${profileItem.authorName} · ${profileItem.targetNeighborhood}`,
    'coloc',
  );
}

export async function adminModerateColocInterest(
  interestItem: ColocInterest,
  decision: Exclude<ContentModerationStatus, 'pending'>,
  reason: string,
  adminUser: User,
  adminName: string,
): Promise<void> {
  if (!interestItem.listingId) {
    throw new Error('Identifiant d’annonce manquant pour cette demande de colocation.');
  }
  const { patch, cleanReason } = buildModerationDecisionPayload(
    interestItem.moderationHistory,
    decision,
    reason,
    adminUser,
    adminName,
    'Demande de colocation approuvée par l’administrateur',
  );
  const targetUserId = interestItem.userId || interestItem.id;
  const path = `listings/${interestItem.listingId}/colocInterests/${targetUserId}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'listings', interestItem.listingId, 'colocInterests', targetUserId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  if (
    targetUserId &&
    isValidFirestoreId(targetUserId) &&
    targetUserId !== adminUser.uid
  ) {
    const label = interestItem.listingTitle || interestItem.listingId;
    const notifTitle =
      decision === 'approved'
        ? 'Demande de colocation approuvée'
        : decision === 'needs_correction'
          ? 'Correction demandée sur votre demande de colocation'
          : 'Demande de colocation refusée';
    const notifMessage =
      decision === 'approved'
        ? `Votre demande pour « ${label} » est désormais visible dans l’espace colocation.`
        : `Votre demande pour « ${label} » : ${cleanReason}`;
    batch.set(
      doc(db, 'notifications', generateId('notif')),
      buildNotificationDoc(targetUserId, 'coloc', notifTitle, notifMessage, interestItem.listingId),
    );
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  await logPlatformActivity(
    adminUser,
    adminName,
    `Demande colocation ${decision}`,
    `${interestItem.userName} · ${interestItem.listingTitle || interestItem.listingId}`,
    'coloc',
  );
}

export async function adminModerateColocMessage(
  messageItem: ColocMessage,
  decision: Exclude<ContentModerationStatus, 'pending'>,
  reason: string,
  adminUser: User,
  adminName: string,
): Promise<void> {
  if (!messageItem.profileId) {
    throw new Error('Identifiant de profil colocation manquant pour ce commentaire.');
  }
  const { patch, cleanReason } = buildModerationDecisionPayload(
    messageItem.moderationHistory,
    decision,
    reason,
    adminUser,
    adminName,
    'Commentaire public validé par l’administrateur',
  );
  const path = `colocProfiles/${messageItem.profileId}/messages/${messageItem.id}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'colocProfiles', messageItem.profileId, 'messages', messageItem.id), patch);
  if (
    messageItem.authorId &&
    isValidFirestoreId(messageItem.authorId) &&
    messageItem.authorId !== adminUser.uid
  ) {
    const notifTitle =
      decision === 'approved'
        ? 'Commentaire colocation publié'
        : decision === 'needs_correction'
          ? 'Commentaire colocation à corriger'
          : 'Commentaire colocation refusé';
    const notifMessage =
      decision === 'approved'
        ? 'Votre commentaire sur l’espace colocation a été approuvé et publié.'
        : `Votre commentaire colocation : ${cleanReason}`;
    batch.set(
      doc(db, 'notifications', generateId('notif')),
      buildNotificationDoc(messageItem.authorId, 'coloc', notifTitle, notifMessage, messageItem.profileId),
    );
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  await logPlatformActivity(
    adminUser,
    adminName,
    `Commentaire colocation ${decision}`,
    `${messageItem.authorName} · ${messageItem.message.slice(0, 60)}`,
    'review',
  );
}

export async function adminModerateListingReview(
  reviewItem: ListingReview,
  decision: Exclude<ContentModerationStatus, 'pending'>,
  reason: string,
  adminUser: User,
  adminName: string,
): Promise<void> {
  const { patch, cleanReason } = buildModerationDecisionPayload(
    reviewItem.moderationHistory,
    decision,
    reason,
    adminUser,
    adminName,
    'Avis publié après validation administrateur',
  );
  const path = `listings/${reviewItem.listingId}/reviews/${reviewItem.id}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'listings', reviewItem.listingId, 'reviews', reviewItem.id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  if (
    reviewItem.authorId &&
    isValidFirestoreId(reviewItem.authorId) &&
    reviewItem.authorId !== adminUser.uid
  ) {
    const notifTitle =
      decision === 'approved'
        ? 'Votre avis public a été approuvé'
        : decision === 'needs_correction'
          ? 'Correction demandée sur votre avis'
          : 'Votre avis public a été refusé';
    const notifMessage =
      decision === 'approved'
        ? `Votre avis sur « ${reviewItem.listingTitle} » est maintenant visible publiquement.`
        : `Votre avis sur « ${reviewItem.listingTitle} » : ${cleanReason}`;
    batch.set(
      doc(db, 'notifications', generateId('notif')),
      buildNotificationDoc(reviewItem.authorId, 'listing', notifTitle, notifMessage, reviewItem.listingId),
    );
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
  await logPlatformActivity(
    adminUser,
    adminName,
    `Avis logement ${decision}`,
    `${reviewItem.authorName} · ${reviewItem.listingTitle}`,
    'review',
  );
}

export async function submitServiceOrder(
  input: {
    orderType: 'visit_pass' | 'top_listing';
    userPhone: string;
    beneficiaryPhone?: string;
    listingId: string;
    listingTitle: string;
    paymentMethod: PaymentMethod;
    transactionRef: string;
    amountFcfa: number;
    durationDays?: number;
    preferredDate: string;
    proofImage?: string;
  },
  user: User,
  actorName: string,
): Promise<string> {
  if (input.orderType !== 'visit_pass' && input.orderType !== 'top_listing') {
    throw new Error('Ce type de service n’est plus disponible sur GidaColocs.');
  }
  const orderId = generateId('ord');
  const cleanPhone = sanitizeText(input.userPhone, BLUEPRINT_LIMITS.PHONE_MAX);
  const cleanRef = sanitizeText(input.transactionRef, BLUEPRINT_LIMITS.TRANSACTION_REF_MAX);
  if (!cleanPhone || !cleanRef) {
    throw new Error('Numéro de téléphone et référence de transaction requis.');
  }

  const refKey = normalizeTransactionRefKey(cleanRef);
  const lockRef = doc(db, 'paymentRefLocks', refKey);
  try {
    const existingLock = await getDoc(lockRef);
    if (existingLock.exists()) {
      throw new Error(
        'Cette référence de transaction a déjà été soumise. Vérifiez le code ou utilisez une nouvelle référence.',
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('déjà été soumise')) {
      throw err;
    }
    // Non-blocking pre-check fallback; atomic rule check below still protects write
  }

  const cleanActor = sanitizeText(actorName || 'Utilisateur', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Utilisateur';
  const initialHistory: PaymentVerificationEntry[] = [
    {
      status: 'pending',
      note: `Preuve soumise via ${input.paymentMethod}`,
      actorName: cleanActor,
      atIso: new Date().toISOString().slice(0, 30),
    },
  ];

  const payload: Record<string, unknown> = {
    orderType: input.orderType,
    userId: user.uid,
    userName: cleanActor,
    userPhone: cleanPhone,
    listingId: sanitizeText(input.listingId || 'general', BLUEPRINT_LIMITS.ID_MAX) || 'general',
    listingTitle: sanitizeText(input.listingTitle, BLUEPRINT_LIMITS.LISTING_TITLE_MAX),
    paymentMethod: input.paymentMethod,
    transactionRef: cleanRef,
    amountFcfa: Math.max(0, Math.min(500000, Math.round(input.amountFcfa))),
    preferredDate: sanitizeText(input.preferredDate, BLUEPRINT_LIMITS.PREFERRED_DATE_MAX),
    status: 'pending',
    adminNote: '',
    verificationHistory: initialHistory,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.beneficiaryPhone) {
    payload.beneficiaryPhone = sanitizeText(input.beneficiaryPhone, 60);
  }
  if (input.orderType === 'top_listing') {
    payload.durationDays = Math.max(1, Math.min(90, Math.round(input.durationDays || 7)));
  }
  if (
    input.proofImage &&
    typeof input.proofImage === 'string' &&
    input.proofImage.length > 0 &&
    input.proofImage.length <= BLUEPRINT_LIMITS.PAYMENT_PROOF_MAX_LENGTH
  ) {
    payload.proofImage = input.proofImage;
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'serviceOrders', orderId), payload);
  batch.set(lockRef, {
    orderId,
    createdAt: serverTimestamp(),
  });

  if (input.orderType === 'top_listing' && input.listingId && input.listingId !== 'general') {
    batch.update(doc(db, 'listings', input.listingId), {
      topRequested: true,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    const checkAfter = await getDoc(lockRef).catch(() => null);
    if (checkAfter && checkAfter.exists()) {
      throw new Error(
        'Cette référence de transaction a déjà été enregistrée. Veuillez en saisir une autre.',
      );
    }
    handleFirestoreError(error, OperationType.CREATE, `serviceOrders/${orderId}`);
  }

  await logPlatformActivity(
    user,
    actorName,
    `Demande ${input.orderType === 'visit_pass' ? 'Pass visite' : 'Annonce Top'} (${input.paymentMethod})`,
    input.listingTitle || cleanRef,
    'order',
  );
  return orderId;
}

export async function adminVerifyServiceOrder(
  order: ServiceOrder,
  adminUser: User,
  adminName: string,
): Promise<void> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const receiptNumber = sanitizeText(
    order.receiptNumber || `QM-${ym}-${order.id.slice(-4).toUpperCase()}`,
    BLUEPRINT_LIMITS.RECEIPT_NO_MAX,
  );
  const cleanAdmin = sanitizeText(adminName || 'Administrateur', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Administrateur';
  const nextHistory: PaymentVerificationEntry[] = [
    ...(order.verificationHistory || []).slice(-(BLUEPRINT_LIMITS.VERIFICATION_HISTORY_MAX - 1)),
    {
      status: 'verified',
      note: sanitizeText(`Paiement confirmé · Reçu ${receiptNumber}`, BLUEPRINT_LIMITS.ADMIN_NOTE_MAX),
      actorName: cleanAdmin,
      atIso: now.toISOString().slice(0, 30),
    },
  ];

  const batch = writeBatch(db);
  batch.update(doc(db, 'serviceOrders', order.id), {
    status: 'verified',
    adminNote: 'Paiement vérifié par GidaColocs',
    receiptNumber,
    verificationHistory: nextHistory,
    updatedAt: serverTimestamp(),
  });

  if (order.orderType === 'visit_pass' && order.listingId && order.listingId !== 'general') {
    const accessId = `${order.userId}_${order.listingId}`;
    batch.set(doc(db, 'passAccess', accessId), {
      userId: order.userId,
      listingId: order.listingId,
      orderId: order.id,
      grantedAt: serverTimestamp(),
    });
  } else if (order.orderType === 'top_listing' && order.listingId && order.listingId !== 'general') {
    batch.update(doc(db, 'listings', order.listingId), {
      isTop: true,
      topRequested: false,
      updatedAt: serverTimestamp(),
    });
  }

  if (order.userId && order.userId !== adminUser.uid) {
    const notifId = generateId('notif');
    const title =
      order.orderType === 'visit_pass'
        ? 'Pass Visite confirmé'
        : 'Annonce TOP activée';
    const message =
      order.orderType === 'visit_pass'
        ? `Votre paiement (${order.transactionRef}) pour « ${order.listingTitle} » est confirmé (Reçu ${receiptNumber}). Le contact du bailleur est débloqué.`
        : `Votre paiement (${order.transactionRef}) est confirmé (Reçu ${receiptNumber}). Votre annonce « ${order.listingTitle} » est mise en avant TOP.`;
    batch.set(
      doc(db, 'notifications', notifId),
      buildNotificationDoc(order.userId, 'payment', title, message, order.id),
    );
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `serviceOrders/${order.id}`);
  }

  await logPlatformActivity(
    adminUser,
    adminName,
    `Paiement confirmé (${receiptNumber})`,
    `${order.userName} · ${order.listingTitle || order.orderType}`,
    'order',
  );
}

export async function adminRejectServiceOrder(
  order: ServiceOrder,
  reason: string,
  adminUser: User,
  adminName: string,
  nextStatus: 'rejected' | 'failed' | 'refunded' = 'rejected',
): Promise<void> {
  const cleanReason = sanitizeText(
    reason.trim() ||
      (nextStatus === 'refunded'
        ? 'Paiement remboursé'
        : nextStatus === 'failed'
          ? 'Transaction échouée ou annulée'
          : 'Transfert non reçu ou référence invalide'),
    BLUEPRINT_LIMITS.REJECTION_REASON_MAX,
  );
  const cleanAdmin = sanitizeText(adminName || 'Administrateur', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Administrateur';
  const nextHistory: PaymentVerificationEntry[] = [
    ...(order.verificationHistory || []).slice(-(BLUEPRINT_LIMITS.VERIFICATION_HISTORY_MAX - 1)),
    {
      status: nextStatus,
      note: cleanReason,
      actorName: cleanAdmin,
      atIso: new Date().toISOString().slice(0, 30),
    },
  ];

  const batch = writeBatch(db);
  batch.update(doc(db, 'serviceOrders', order.id), {
    status: nextStatus,
    adminNote: cleanReason,
    rejectionReason: cleanReason,
    verificationHistory: nextHistory,
    updatedAt: serverTimestamp(),
  });

  if (nextStatus === 'rejected' || nextStatus === 'failed') {
    const refKey = normalizeTransactionRefKey(order.transactionRef);
    batch.delete(doc(db, 'paymentRefLocks', refKey));
  }
  if (nextStatus === 'refunded' && order.orderType === 'visit_pass' && order.listingId && order.listingId !== 'general') {
    batch.delete(doc(db, 'passAccess', `${order.userId}_${order.listingId}`));
  }

  if (order.userId && order.userId !== adminUser.uid) {
    const notifId = generateId('notif');
    const title =
      nextStatus === 'refunded'
        ? 'Paiement remboursé'
        : nextStatus === 'failed'
          ? 'Paiement marqué échoué'
          : 'Paiement refusé';
    const message = `Votre paiement (${order.transactionRef}) pour « ${order.listingTitle || order.orderType} » : ${cleanReason}`;
    batch.set(
      doc(db, 'notifications', notifId),
      buildNotificationDoc(order.userId, 'payment', title, message, order.id),
    );
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `serviceOrders/${order.id}`);
  }
  const actionLabel =
    nextStatus === 'refunded'
      ? 'Paiement remboursé'
      : nextStatus === 'failed'
        ? 'Paiement marqué échoué'
        : 'Paiement refusé';
  await logPlatformActivity(adminUser, adminName, actionLabel, `${order.userName} · ${cleanReason}`, 'order');
}

export async function submitListingReport(
  listing: Listing,
  reason: ReportReason,
  details: string,
  user: User,
  actorName: string,
): Promise<void> {
  const reportId = generateId('rep');
  const cleanDetails = sanitizeText(details, BLUEPRINT_LIMITS.REPORT_DETAILS_MAX);
  if (!cleanDetails) throw new Error('Veuillez préciser le motif du signalement.');

  try {
    await setDoc(doc(db, 'reports', reportId), {
      listingId: listing.id,
      listingTitle: sanitizeText(listing.title, BLUEPRINT_LIMITS.LISTING_TITLE_MAX),
      reporterId: user.uid,
      reporterName: sanitizeText(actorName || 'Utilisateur', BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || 'Utilisateur',
      reason,
      details: cleanDetails,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }

  await logPlatformActivity(user, actorName, 'Signalement envoyé', listing.title, 'report');
}

export async function adminUpdateReportStatus(
  reportId: string,
  listingTitle: string,
  status: Exclude<ReportStatus, 'open'>,
  adminUser: User,
  adminName: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
  await logPlatformActivity(adminUser, adminName, `Signalement ${status}`, listingTitle, 'report');
}

export async function adminUpdateColocReportStatus(
  reportId: string,
  targetLabel: string,
  status: Exclude<ReportStatus, 'open'>,
  adminUser: User,
  adminName: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'colocReports', reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `colocReports/${reportId}`);
  }
  await logPlatformActivity(
    adminUser,
    adminName,
    `Signalement colocation ${status === 'resolved' ? 'traité' : 'classé'}`,
    targetLabel,
    'coloc',
  );
}

export async function savePlatformConfig(
  config: Omit<PlatformConfig, 'updatedAt' | 'contractPrice'>,
  adminUser: User,
  adminName: string,
): Promise<void> {
  const rawGroupUrl = (config.whatsappGroupUrl || '').trim();
  const safeGroupUrl =
    rawGroupUrl && /^https:\/\//i.test(rawGroupUrl)
      ? sanitizeText(rawGroupUrl, BLUEPRINT_LIMITS.WHATSAPP_GROUP_URL_MAX)
      : '';

  try {
    await setDoc(doc(db, 'platformConfig', 'settings'), {
      visitPassPrice: Math.max(0, Math.min(500000, Math.round(config.visitPassPrice))),
      topListingPrice: Math.max(0, Math.min(500000, Math.round(config.topListingPrice))),
      topListingDurationDays: Math.max(
        1,
        Math.min(90, Math.round(config.topListingDurationDays || 7)),
      ),
      whatsappNumber: sanitizeText(config.whatsappNumber, BLUEPRINT_LIMITS.PHONE_MAX),
      whatsappSecondaryNumber: sanitizeText(config.whatsappSecondaryNumber || '', BLUEPRINT_LIMITS.PHONE_MAX),
      whatsappGroupUrl: safeGroupUrl,
      mtnNumber: sanitizeText(config.mtnNumber || '', 60),
      moovNumber: sanitizeText(config.moovNumber, 60),
      airtelNumber: sanitizeText(config.airtelNumber, 60),
      nitaAccount: sanitizeText(config.nitaAccount, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'platformConfig/settings');
  }
  await logPlatformActivity(adminUser, adminName, 'Tarifs et coordonnées mis à jour', 'Configuration générale', 'config');
}

export async function adminInitializeStarterListings(
  adminUser: User,
  adminName: string,
): Promise<void> {
  const starters: CreateListingInput[] = [
    {
      title: 'Chambre unique carrelée avec douche interne — proche UDM',
      description:
        'Chambre calme dans une cour sécurisée à 6 minutes à pied de l’Université Dan Dicko Dankoulodo. Eau courante permanente (SEEN), compteur individuel NIGELEC, douche et WC internes.',
      neighborhood: 'Ali Dan Sofo',
      locationDetails: 'À 6 min à pied de l’UDM, rue calme',
      propertyType: 'chambre',
      priceFcfa: 20000,
      depositMonths: 2,
      availableSpots: 1,
      roomsCount: 1,
      availability: 'Disponible immédiatement',
      amenities: ['Douche interne', 'Eau courante (SEEN)', 'Électricité (NIGELEC)', 'Carrelage', 'Cour fermée / Gardien', 'Proche UDM'],
      photos: [],
      bathroomType: 'interne',
      toiletType: 'interne',
      furnished: 'non_meuble',
      waterElectricity: 'compteur_individuel',
      surfaceSqm: 16,
      roommatePreference: 'etudiants',
      houseRules: 'Cour calme après 22h, visites autorisées en journée.',
      contactName: adminName,
      contactPhone: '+227 90 00 00 00',
      contactWhatsapp: '+227 90 00 00 00',
      depositorAddress: 'Ali Dan Sofo, Maradi',
      depositorStatus: 'proprietaire',
      authorizationNote: 'Annonce modèle vérifiée GidaColocs.',
      publishImmediately: true,
      isVerifiedQolock: true,
      isTop: true,
    },
    {
      title: 'Maison à partager (3 colocataires) — Zone UDM',
      description:
        'Grande maison de 3 chambres et un salon commun à partager entre étudiants ou jeunes actifs. Loyer indiqué par personne (12 500 FCFA/mois). Cuisine équipée, véranda et grande cour fermée.',
      neighborhood: 'Zone UDM',
      locationDetails: 'Proche axe universitaire UDM',
      propertyType: 'maison_partagee',
      priceFcfa: 12500,
      depositMonths: 1,
      availableSpots: 2,
      roomsCount: 4,
      availability: 'Disponible immédiatement',
      amenities: ['Eau courante (SEEN)', 'Électricité (NIGELEC)', 'Cuisine équipée', 'Véranda / Terrasse', 'Cour fermée / Gardien', 'Proche UDM'],
      photos: [],
      bathroomType: 'partagee',
      toiletType: 'externe',
      furnished: 'semi_meuble',
      waterElectricity: 'partage',
      surfaceSqm: 95,
      roommatePreference: 'etudiants',
      houseRules: 'Partage équitable des factures SEEN/NIGELEC et entretien hebdomadaire des espaces communs.',
      contactName: adminName,
      contactPhone: '+227 96 00 00 00',
      contactWhatsapp: '+227 96 00 00 00',
      depositorAddress: 'Zone UDM, Maradi',
      depositorStatus: 'proprietaire',
      authorizationNote: 'Annonce modèle vérifiée GidaColocs.',
      publishImmediately: true,
      isVerifiedQolock: true,
      isTop: false,
    },
    {
      title: 'Annexe indépendante propre avec douche externe privée',
      description:
        'Annexe calme et ventilée à Sabon Gari avec accès indépendant sur cour, chambre spacieuse et douche externe dédiée. Idéale pour étudiant en master ou jeune actif.',
      neighborhood: 'Sabon Gari',
      locationDetails: 'Secteur calme proche goudron Sabon Gari',
      propertyType: 'annexe',
      priceFcfa: 25000,
      depositMonths: 2,
      availableSpots: 1,
      roomsCount: 1,
      availability: 'Disponible immédiatement',
      amenities: ['Douche externe', 'Eau courante (SEEN)', 'Électricité (NIGELEC)', 'Ventilateur', 'Accès goudron'],
      photos: [],
      bathroomType: 'externe',
      toiletType: 'externe',
      furnished: 'non_meuble',
      waterElectricity: 'compteur_individuel',
      surfaceSqm: 22,
      roommatePreference: 'jeunes_actifs',
      houseRules: 'Respect de la tranquillité de la concession familiale.',
      contactName: adminName,
      contactPhone: '+227 90 00 00 00',
      contactWhatsapp: '+227 90 00 00 00',
      depositorAddress: 'Sabon Gari, Maradi',
      depositorStatus: 'proprietaire',
      authorizationNote: 'Annonce modèle vérifiée GidaColocs.',
      publishImmediately: true,
      isVerifiedQolock: true,
      isTop: false,
    },
    {
      title: 'Appartement 2 chambres salon — Zaria',
      description:
        'Appartement moderne carrelé avec plafond isolé, salon spacieux, cuisine équipée et deux chambres avec douches internes. Proche axe principal.',
      neighborhood: 'Zaria',
      locationDetails: 'À 200m de l’axe principal Zaria',
      propertyType: 'appartement',
      priceFcfa: 65000,
      depositMonths: 2,
      availableSpots: 2,
      roomsCount: 3,
      availability: 'Disponible immédiatement',
      amenities: ['Douche interne', 'Eau courante (SEEN)', 'Électricité (NIGELEC)', 'Carrelage', 'Plafond isolé', 'Cuisine équipée', 'Accès goudron'],
      photos: [],
      bathroomType: 'interne',
      toiletType: 'interne',
      furnished: 'non_meuble',
      waterElectricity: 'compteur_individuel',
      surfaceSqm: 72,
      roommatePreference: 'mixte',
      houseRules: 'Bail minimum 6 mois renouvelable.',
      contactName: adminName,
      contactPhone: '+227 96 00 00 00',
      contactWhatsapp: '+227 96 00 00 00',
      depositorAddress: 'Zaria, Maradi',
      depositorStatus: 'proprietaire',
      authorizationNote: 'Annonce modèle vérifiée GidaColocs.',
      publishImmediately: true,
      isVerifiedQolock: true,
      isTop: false,
    },
  ];

  for (const item of starters) {
    await createListing(item, adminUser, adminName, true);
  }
}
