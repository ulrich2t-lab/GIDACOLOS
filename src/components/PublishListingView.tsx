import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  Camera,
  Check,
  Film,
  ImagePlus,
  Link2,
  Plus,
  Trash2,
  Video,
} from 'lucide-react';
import {
  AMENITIES_OPTIONS,
  BATHROOM_OPTIONS,
  DEPOSITOR_STATUS_OPTIONS,
  FURNISHED_OPTIONS,
  LISTING_AVAILABILITY_PRESETS,
  MARADI_NEIGHBORHOODS,
  PROPERTY_TYPES,
  ROOMMATE_PREFERENCES,
  TOILET_OPTIONS,
  UTILITY_OPTIONS,
} from '../lib/constants';
import {
  formatDurationLabel,
  isValidHttpUrl,
  type PendingVideoDraft,
  processVideoFileToClip,
  uploadListingPhoto,
} from '../lib/mediaUtils';
import {
  createListing,
  fetchListingPrivateContact,
  fetchListingPrivateVerification,
  fetchListingVideoClip,
  updateListingDetails,
} from '../lib/qolockService';
import { formatFirestoreErrorMessage } from '../lib/firestoreError';
import {
  readSessionJson,
  readUrlParam,
  removeSessionKey,
  writeSessionJson,
} from '../lib/urlState';
import { BLUEPRINT_LIMITS } from '../lib/validation';
import { useAuth } from '../context/AuthContext';
import { AuthPanel } from './AuthPanel';
import { CameraCaptureModal } from './CameraCaptureModal';
import type {
  BathroomType,
  DepositorStatus,
  FurnishedType,
  Listing,
  PropertyType,
  RoommatePreference,
  ToiletType,
  WaterElectricityType,
} from '../types/platform';

interface PublishListingViewProps {
  editingListing?: Listing | null;
  onSuccess: (message?: string) => void;
  onCancelEdit?: () => void;
}

const PUBLISH_DRAFT_KEY = 'gidacolocs_publish_draft_v1';

interface PublishDraftFields {
  title?: string;
  neighborhood?: string;
  locationDetails?: string;
  propertyType?: PropertyType;
  priceFcfa?: string;
  depositMonths?: string;
  roomsCount?: string;
  availability?: string;
  bathroomType?: BathroomType;
  toiletType?: ToiletType;
  furnished?: FurnishedType;
  waterElectricity?: WaterElectricityType;
  roommatePreference?: RoommatePreference;
  description?: string;
  amenities?: string[];
  contactName?: string;
  contactPhone?: string;
  contactWhatsapp?: string;
  depositorAddress?: string;
  depositorStatus?: DepositorStatus;
  authorizationNote?: string;
}

export function PublishListingView({
  editingListing = null,
  onSuccess,
  onCancelEdit,
}: PublishListingViewProps) {
  const { user, profile, privatePhone, isAdmin, isSuspended, saveWhatsAppNumber } = useAuth();
  const hasEditParam = Boolean(readUrlParam('edit'));
  const savedDraft =
    !editingListing && !hasEditParam
      ? readSessionJson<PublishDraftFields>(PUBLISH_DRAFT_KEY, {})
      : {};

  const [title, setTitle] = useState(savedDraft.title || '');
  const [neighborhood, setNeighborhood] = useState<string>(
    savedDraft.neighborhood || MARADI_NEIGHBORHOODS[0],
  );
  const [locationDetails, setLocationDetails] = useState(savedDraft.locationDetails || '');
  const [propertyType, setPropertyType] = useState<PropertyType>(
    savedDraft.propertyType || 'chambre',
  );
  const [priceFcfa, setPriceFcfa] = useState(savedDraft.priceFcfa || '20000');
  const [depositMonths, setDepositMonths] = useState(savedDraft.depositMonths || '1');
  const [roomsCount, setRoomsCount] = useState(savedDraft.roomsCount || '1');
  const [availability, setAvailability] = useState(
    savedDraft.availability || 'Disponible immédiatement',
  );
  const [bathroomType, setBathroomType] = useState<BathroomType>(
    savedDraft.bathroomType || 'interne',
  );
  const [toiletType, setToiletType] = useState<ToiletType>(savedDraft.toiletType || 'interne');
  const [furnished, setFurnished] = useState<FurnishedType>(savedDraft.furnished || 'non_meuble');
  const [waterElectricity, setWaterElectricity] = useState<WaterElectricityType>(
    savedDraft.waterElectricity || 'compteur_individuel',
  );
  const [roommatePreference, setRoommatePreference] = useState<RoommatePreference>(
    savedDraft.roommatePreference || 'etudiants',
  );
  const [description, setDescription] = useState(savedDraft.description || '');
  const [amenities, setAmenities] = useState<string[]>(
    Array.isArray(savedDraft.amenities)
      ? savedDraft.amenities
      : ['Douche interne', 'Eau courante (SEEN)', 'Électricité (NIGELEC)'],
  );

  // Photos state
  const [photos, setPhotos] = useState<string[]>([]);
  const [showPhotoUrlInput, setShowPhotoUrlInput] = useState(false);
  const [photoUrlDraft, setPhotoUrlDraft] = useState('');

  // Videos state
  const [videos, setVideos] = useState<PendingVideoDraft[]>([]);
  const [removedClipIds, setRemovedClipIds] = useState<string[]>([]);
  const [videoInputMode, setVideoInputMode] = useState<'file' | 'url'>('file');
  const [videoTitleDraft, setVideoTitleDraft] = useState('');
  const [videoUrlDraft, setVideoUrlDraft] = useState('');
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);

  const [contactName, setContactName] = useState(savedDraft.contactName || '');
  const [contactPhone, setContactPhone] = useState(savedDraft.contactPhone || '');
  const [contactWhatsapp, setContactWhatsapp] = useState(savedDraft.contactWhatsapp || '');
  const [depositorAddress, setDepositorAddress] = useState(savedDraft.depositorAddress || '');
  const [depositorStatus, setDepositorStatus] = useState<DepositorStatus>(
    savedDraft.depositorStatus || 'proprietaire',
  );
  const [authorizationNote, setAuthorizationNote] = useState(savedDraft.authorizationNote || '');
  const [publishImmediately, setPublishImmediately] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraModalMode, setCameraModalMode] = useState<'photo' | 'video'>('photo');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const lastLoadedListingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (editingListing || readUrlParam('edit')) return;
    writeSessionJson<PublishDraftFields>(PUBLISH_DRAFT_KEY, {
      title,
      neighborhood,
      locationDetails,
      propertyType,
      priceFcfa,
      depositMonths,
      roomsCount,
      availability,
      bathroomType,
      toiletType,
      furnished,
      waterElectricity,
      roommatePreference,
      description,
      amenities,
      contactName,
      contactPhone,
      contactWhatsapp,
      depositorAddress,
      depositorStatus,
      authorizationNote,
    });
  }, [
    editingListing,
    title,
    neighborhood,
    locationDetails,
    propertyType,
    priceFcfa,
    depositMonths,
    roomsCount,
    availability,
    bathroomType,
    toiletType,
    furnished,
    waterElectricity,
    roommatePreference,
    description,
    amenities,
    contactName,
    contactPhone,
    contactWhatsapp,
    depositorAddress,
    depositorStatus,
    authorizationNote,
  ]);

  useEffect(() => {
    let active = true;
    const nextId = editingListing?.id ?? null;

    if (editingListing) {
      lastLoadedListingIdRef.current = nextId;
      setTitle(editingListing.title);
      setNeighborhood(editingListing.neighborhood);
      setLocationDetails(editingListing.locationDetails || '');
      setPropertyType(
        editingListing.propertyType === 'colocation'
          ? 'maison_partagee'
          : editingListing.propertyType,
      );
      setPriceFcfa(String(editingListing.priceFcfa));
      setDepositMonths(String(editingListing.depositMonths));
      setRoomsCount(String(editingListing.roomsCount ?? 1));
      setAvailability(editingListing.availability || 'Disponible immédiatement');
      setBathroomType(editingListing.bathroomType || 'interne');
      setToiletType(editingListing.toiletType || 'interne');
      setFurnished(editingListing.furnished || 'non_meuble');
      setWaterElectricity(editingListing.waterElectricity || 'compteur_individuel');
      setRoommatePreference(editingListing.roommatePreference || 'mixte');
      setDescription(editingListing.description);
      setAmenities(editingListing.amenities);
      setPhotos(editingListing.photos);
      setRemovedClipIds([]);

      const initialVideos: PendingVideoDraft[] = (editingListing.videos || []).map((v) => ({
        id: v.id,
        title: v.title,
        sourceType: v.sourceType,
        url: v.url,
        clipId: v.clipId,
        durationSec: v.durationSec,
        isExistingClip: v.sourceType === 'clip',
      }));
      setVideos(initialVideos);

      // Load previews for existing video clips
      initialVideos
        .filter((v) => v.sourceType === 'clip' && v.clipId)
        .forEach((v) => {
          void fetchListingVideoClip(editingListing.id, v.clipId)
            .then((clip) => {
              if (!active || !clip) return;
              setVideos((prev) =>
                prev.map((item) =>
                  item.clipId === v.clipId
                    ? { ...item, dataUrl: clip.dataUrl, mimeType: clip.mimeType }
                    : item,
                ),
              );
            })
            .catch((err) => {
              if (active) {
                setError(
                  formatFirestoreErrorMessage(
                    err,
                    'Impossible de charger la vidéo existante pour le moment.',
                  ),
                );
              }
            });
        });

      void Promise.all([
        fetchListingPrivateContact(editingListing.id).catch(() => null),
        fetchListingPrivateVerification(editingListing.id).catch(() => null),
      ]).then(([contact, verification]) => {
        if (!active) return;
        if (verification) {
          setContactName(verification.contactName || contact?.contactName || '');
          setContactPhone(verification.contactPhone || contact?.contactPhone || '');
          setContactWhatsapp(verification.contactWhatsapp || '');
          setDepositorAddress(verification.depositorAddress || '');
          setDepositorStatus(verification.depositorStatus || 'proprietaire');
          setAuthorizationNote(verification.authorizationNote || '');
        } else if (contact) {
          setContactName(contact.contactName);
          setContactPhone(contact.contactPhone);
        }
      });
    } else if (lastLoadedListingIdRef.current !== null) {
      // Only reset form when exiting edit mode, never on profile/phone background sync
      lastLoadedListingIdRef.current = null;
      setTitle('');
      setLocationDetails('');
      setRoomsCount('1');
      setAvailability('Disponible immédiatement');
      setDescription('');
      setPhotos([]);
      setVideos([]);
      setRemovedClipIds([]);
      setContactName(profile?.displayName || user?.displayName || '');
      setContactPhone(privatePhone || '');
      setContactWhatsapp('');
      setDepositorAddress('');
      setDepositorStatus('proprietaire');
      setAuthorizationNote('');
    }
    return () => {
      active = false;
    };
  }, [editingListing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill contact coordinates when creating a new listing without wiping user inputs
  useEffect(() => {
    if (editingListing) return;
    const defaultName = profile?.displayName || user?.displayName || '';
    if (defaultName) {
      setContactName((prev) => prev || defaultName);
    }
    if (privatePhone) {
      setContactPhone((prev) => prev || privatePhone);
    }
  }, [editingListing, profile?.displayName, user?.displayName, privatePhone]);

  useEffect(() => {
    return () => {
      videoAbortRef.current?.abort();
    };
  }, []);

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-6 hero-diamond-pattern text-white border border-indigo-400/20 rounded-3xl p-6 sm:p-8 space-y-5 shadow-xl">
          <div className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-teal-300">
              Publication Gratuite · Maradi
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white leading-tight text-balance">
              Publiez votre logement gratuitement à Maradi
            </h2>
            <p className="text-[15px] font-medium text-slate-200 leading-relaxed">
              Chambres, studios, appartements, maisons, annexes ou autres logements : publication
              100 % gratuite pour tous, avec vérification administrative avant mise en ligne.
            </p>
          </div>

          <div className="space-y-3.5 pt-4 border-t border-white/15 text-sm font-medium text-slate-100">
            <div className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>Aucun paiement demandé pour déposer une annonce ordinaire.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Camera className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" />
              <span>Photos réelles et vidéos ajoutées facilement depuis votre téléphone.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-teal-300 shrink-0 mt-0.5" />
              <span>Vos coordonnées personnelles restent strictement confidentielles.</span>
            </div>
          </div>
        </section>

        <section className="lg:col-span-6 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-indigo-400/20 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
          <div>
            <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
              Connectez votre espace pour publier
            </h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Connexion rapide par code WhatsApp + code secret ou Google en 1 clic.
            </p>
          </div>
          <AuthPanel defaultAccountType="landlord" />
        </section>
      </div>
    );
  }

  if (isSuspended && !isAdmin) {
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#0F172A] border border-red-200 dark:border-red-900/60 rounded-2xl p-6 sm:p-8 space-y-3 text-center shadow-sm">
        <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto" />
        <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-white">
          Publication désactivée — Compte suspendu
        </h2>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
          Votre compte est actuellement suspendu par l’administration GidaColocs. Vous ne pouvez pas
          publier ni modifier d’annonce tant que votre compte n’est pas réactivé.
        </p>
        {profile?.suspendedReason && (
          <p className="text-sm text-red-700 dark:text-red-300 font-semibold">
            Motif : {profile.suspendedReason}
          </p>
        )}
      </div>
    );
  }

  const toggleAmenity = (item: string) => {
    setAmenities((prev) =>
      prev.includes(item)
        ? prev.filter((a) => a !== item)
        : prev.length < BLUEPRINT_LIMITS.MAX_AMENITIES
          ? [...prev, item]
          : prev,
    );
  };

  const handleBathroomSelect = (nextBathroom: BathroomType) => {
    setBathroomType(nextBathroom);
    setAmenities((prev) => {
      const cleaned = prev.filter((a) => a !== 'Douche interne' && a !== 'Douche externe');
      if (nextBathroom === 'interne')
        return ['Douche interne', ...cleaned].slice(0, BLUEPRINT_LIMITS.MAX_AMENITIES);
      if (nextBathroom === 'externe')
        return ['Douche externe', ...cleaned].slice(0, BLUEPRINT_LIMITS.MAX_AMENITIES);
      return cleaned;
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const remainingSlots = BLUEPRINT_LIMITS.MAX_PHOTOS - photos.length;
      const toProcess = Array.from(files).slice(0, remainingSlots);
      const compressed = await Promise.all(
        toProcess.map((f) => uploadListingPhoto(f, user?.uid || '')),
      );
      setPhotos((prev) => [...prev, ...compressed].slice(0, BLUEPRINT_LIMITS.MAX_PHOTOS));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du traitement des photos.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleAddPhotoByUrl = () => {
    setError(null);
    const trimmed = photoUrlDraft.trim();
    if (!isValidHttpUrl(trimmed)) {
      setError('Veuillez entrer un lien image valide commençant par https://.');
      return;
    }
    if (photos.length >= BLUEPRINT_LIMITS.MAX_PHOTOS) {
      setError(`Nombre maximum de ${BLUEPRINT_LIMITS.MAX_PHOTOS} photos atteint.`);
      return;
    }
    setPhotos((prev) => [...prev, trimmed]);
    setPhotoUrlDraft('');
    setShowPhotoUrlInput(false);
  };

  const handlePromotePhotoCover = (idx: number) => {
    if (idx <= 0) return;
    setPhotos((prev) => {
      const selected = prev[idx];
      const rest = prev.filter((_, i) => i !== idx);
      return [selected, ...rest];
    });
  };

  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (videos.length >= BLUEPRINT_LIMITS.MAX_VIDEOS) {
      setError(`Vous pouvez ajouter jusqu’à ${BLUEPRINT_LIMITS.MAX_VIDEOS} vidéos par annonce.`);
      e.target.value = '';
      return;
    }

    const file = files[0];
    setError(null);
    setVideoProgress(5);
    const controller = new AbortController();
    videoAbortRef.current = controller;

    try {
      const result = await processVideoFileToClip(
        file,
        (pct) => setVideoProgress(pct),
        controller.signal,
      );
      const defaultTitle =
        videoTitleDraft.trim() ||
        `Visite vidéo ${videos.length + 1}`;
      const newClipId = `clip_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      setVideos((prev) => [
        ...prev,
        {
          id: newClipId,
          title: defaultTitle.slice(0, BLUEPRINT_LIMITS.VIDEO_TITLE_MAX),
          sourceType: 'clip',
          url: '',
          clipId: newClipId,
          durationSec: result.durationSec,
          mimeType: result.mimeType,
          dataUrl: result.dataUrl,
          isExistingClip: false,
        },
      ]);
      setVideoTitleDraft('');
    } catch (err) {
      if (!(err instanceof Error && err.message === 'Traitement vidéo annulé.')) {
        setError(err instanceof Error ? err.message : 'Erreur lors du traitement de la vidéo.');
      }
    } finally {
      setVideoProgress(null);
      videoAbortRef.current = null;
      e.target.value = '';
    }
  };

  const handleAddVideoUrl = () => {
    setError(null);
    const trimmedUrl = videoUrlDraft.trim();
    if (!isValidHttpUrl(trimmedUrl)) {
      setError('Veuillez saisir un lien vidéo valide (https://youtube.com/..., TikTok, Drive ou MP4).');
      return;
    }
    if (videos.length >= BLUEPRINT_LIMITS.MAX_VIDEOS) {
      setError(`Maximum ${BLUEPRINT_LIMITS.MAX_VIDEOS} vidéos autorisées par annonce.`);
      return;
    }
    const vidId = `vid_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const cleanTitle =
      videoTitleDraft.trim().slice(0, BLUEPRINT_LIMITS.VIDEO_TITLE_MAX) ||
      `Visite vidéo ${videos.length + 1}`;
    setVideos((prev) => [
      ...prev,
      {
        id: vidId,
        title: cleanTitle,
        sourceType: 'url',
        url: trimmedUrl,
        clipId: '',
        durationSec: 0,
      },
    ]);
    setVideoUrlDraft('');
    setVideoTitleDraft('');
  };

  const handleRemoveVideo = (idx: number) => {
    const target = videos[idx];
    if (target?.sourceType === 'clip' && target.isExistingClip && target.clipId) {
      setRemovedClipIds((prev) => [...prev, target.clipId]);
    }
    setVideos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!title.trim()) {
      setError('Veuillez indiquer le titre de votre annonce.');
      return;
    }
    if (!locationDetails.trim()) {
      setError('Veuillez préciser la localisation ou un repère du logement dans le quartier.');
      return;
    }
    if (!availability.trim()) {
      setError('Veuillez préciser la disponibilité du logement.');
      return;
    }
    if (!isAdmin && photos.length < 1) {
      setError('Veuillez ajouter au moins une photo réelle du logement avant soumission.');
      return;
    }
    if (!contactName.trim() || !contactPhone.trim() || !depositorAddress.trim()) {
      setError(
        'Veuillez renseigner vos nom et prénom, numéro de téléphone et quartier ou adresse du déposant.',
      );
      return;
    }
    if (depositorStatus !== 'proprietaire' && !authorizationNote.trim()) {
      setError(
        'En tant que démarcheur ou représentant, veuillez expliquer votre autorisation à proposer ce logement.',
      );
      return;
    }
    if (videoProgress !== null) {
      setError('Veuillez patienter pendant l’optimisation de votre vidéo.');
      return;
    }

    setSaving(true);
    const actorName = profile?.displayName || user.displayName || 'Propriétaire';
    try {
      await user.getIdToken(true).catch(() => undefined);
      let confirmation = '';
      if (editingListing) {
        const isResubmit = !isAdmin;
        await updateListingDetails(
          editingListing.id,
          editingListing.ownerId,
          {
            title,
            description,
            neighborhood,
            locationDetails,
            propertyType,
            priceFcfa: Number(priceFcfa),
            depositMonths: Number(depositMonths),
            availableSpots: editingListing.availableSpots ?? 1,
            roomsCount: Number(roomsCount) || 1,
            availability,
            amenities,
            photos,
            videos,
            removedClipIds,
            bathroomType,
            toiletType,
            furnished,
            waterElectricity,
            surfaceSqm: editingListing.surfaceSqm ?? 0,
            roommatePreference,
            houseRules: editingListing.houseRules ?? '',
            contactName,
            contactPhone,
            contactWhatsapp,
            depositorAddress,
            depositorStatus,
            authorizationNote,
          },
          user,
          actorName,
          { resubmitForReview: isResubmit, isAdminEditor: isAdmin },
        );
        confirmation = isResubmit
          ? 'Modifications enregistrées ! Votre annonce est repassée en validation administrateur avant affichage public.'
          : 'Annonce mise à jour avec succès.';
      } else {
        await createListing(
          {
            title,
            description,
            neighborhood,
            locationDetails,
            propertyType,
            priceFcfa: Number(priceFcfa),
            depositMonths: Number(depositMonths),
            availableSpots: 1,
            roomsCount: Number(roomsCount) || 1,
            availability,
            amenities,
            photos,
            videos,
            bathroomType,
            toiletType,
            furnished,
            waterElectricity,
            surfaceSqm: 0,
            roommatePreference,
            houseRules: '',
            contactName,
            contactPhone,
            contactWhatsapp,
            depositorAddress,
            depositorStatus,
            authorizationNote,
            publishImmediately: isAdmin && publishImmediately,
            isVerifiedQolock: isAdmin && publishImmediately,
          },
          user,
          actorName,
          isAdmin,
        );
        confirmation =
          isAdmin && publishImmediately
            ? 'Logement publié et visible immédiatement sur l’accueil.'
            : 'Annonce soumise gratuitement ! Statut actuel : En attente de validation par l’administrateur.';
      }
      if (!editingListing) {
        removeSessionKey(PUBLISH_DRAFT_KEY);
      }
      setSuccessMsg(confirmation);
      if (!privatePhone && contactPhone.trim()) {
        void saveWhatsAppNumber(contactPhone);
      }
      onSuccess(confirmation);
    } catch (err) {
      setError(formatFirestoreErrorMessage(err, 'Erreur lors de la sauvegarde de l’annonce.'));
    } finally {
      setSaving(false);
    }
  };

  const isShared = propertyType === 'maison_partagee' || propertyType === 'colocation';

  return (
    <div className="max-w-3xl mx-auto bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/90 rounded-2xl overflow-hidden shadow-sm">
      <div className="hero-diamond-pattern text-white px-6 py-6 sm:px-8 border-b border-indigo-400/20 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-teal-300 mb-1">
            Dépôt d’annonce · Maradi
          </p>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-white">
            {editingListing ? 'Modifier l’annonce immobilière' : 'Publier un logement à Maradi'}
          </h2>
          <p className="text-sm font-medium text-slate-200 mt-1">
            {isAdmin
              ? 'Mode Administrateur : publication directe ou mise en validation.'
              : 'Publication 100 % gratuite — Validation administrateur obligatoire avant affichage public.'}
          </p>
        </div>
        {editingListing && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="min-h-[42px] px-4 py-2 text-xs font-bold text-white border border-white/25 hover:bg-white/10 rounded-xl cursor-pointer whitespace-nowrap shrink-0"
          >
            Annuler
          </button>
        )}
      </div>

      <div className="p-6 sm:p-8">
      {/* Publication gratuite & validation banner */}
      {!editingListing && (
        <div className="mb-6 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/75 dark:bg-emerald-950/35 text-sm text-emerald-900 dark:text-emerald-200 space-y-1.5">
          <p className="font-bold">
            Publication ordinaire 100 % gratuite (0 FCFA) — Aucun paiement demandé
          </p>
          <p className="text-xs font-medium leading-relaxed">
            Déposez gratuitement chambres, studios, appartements, maisons, maisons à partager,
            annexes ou autres logements. Votre annonce reçoit le statut « En attente de validation »
            et devient publique uniquement après vérification par l’administrateur. L’option
            facultative Annonce Top (1 000 FCFA) n’est proposée qu’après approbation.
          </p>
        </div>
      )}

      {editingListing && !isAdmin && (
        <div className="mb-6 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-sm text-amber-800 dark:text-amber-200 space-y-1.5">
          <p className="font-bold">
            {editingListing.status === 'needs_correction'
              ? 'Corrections demandées par l’administrateur'
              : editingListing.status === 'rejected'
                ? 'Correction avant nouvelle validation'
                : 'Modification soumise à validation administrateur'}
          </p>
          {editingListing.moderationReason && (
            <p className="font-medium">Message de l’administrateur : {editingListing.moderationReason}</p>
          )}
          <p className="text-xs font-medium">
            Toute modification (photos ou informations) place automatiquement l’annonce en statut
            « En attente de validation » jusqu’à l’approbation de l’administrateur.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-5 p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-5 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Property Type Selector Cards */}
        <div>
          <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Catégorie du bien immobilier
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {PROPERTY_TYPES.map((pt) => {
              const active = propertyType === pt.value;
              return (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setPropertyType(pt.value)}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-teal-500 bg-teal-50/75 dark:bg-teal-950/55'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{pt.label}</p>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    {pt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
            Titre de l’annonce
          </label>
          <input
            type="text"
            required
            maxLength={BLUEPRINT_LIMITS.LISTING_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. Chambre unique carrelée douche interne à Ali Dan Sofo ou Maison à partager Zone UDM"
            className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Quartier à Maradi
            </label>
            <select
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            >
              {MARADI_NEIGHBORHOODS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Localisation précise / repères dans le quartier
            </label>
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.LOCATION_DETAILS_MAX}
              value={locationDetails}
              onChange={(e) => setLocationDetails(e.target.value)}
              placeholder="Ex. À 150 m du goudron, près du forage ou campus UDM"
              className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            />
          </div>
        </div>

        {/* Financial & Rooms Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              {isShared ? 'Loyer / personne (FCFA)' : 'Loyer mensuel (FCFA)'}
            </label>
            <input
              type="number"
              required
              min={0}
              max={5000000}
              step={500}
              value={priceFcfa}
              onChange={(e) => setPriceFcfa(e.target.value)}
              className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Nombre de pièces
            </label>
            <input
              type="number"
              required
              min={1}
              max={30}
              value={roomsCount}
              onChange={(e) => setRoomsCount(e.target.value)}
              className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Caution / Avance (mois)
            </label>
            <input
              type="number"
              min={0}
              max={12}
              value={depositMonths}
              onChange={(e) => setDepositMonths(e.target.value)}
              className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            />
          </div>
        </div>

        {/* Availability */}
        <div className="space-y-2.5">
          <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            Disponibilité du logement
          </label>
          <input
            type="text"
            required
            maxLength={BLUEPRINT_LIMITS.AVAILABILITY_MAX}
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            placeholder="Ex. Disponible immédiatement, à partir du 1er du mois..."
            className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
          />
          <div className="flex flex-wrap items-center gap-2">
            {LISTING_AVAILABILITY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAvailability(preset)}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                  availability === preset
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Real-Estate Specifications */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Caractéristiques immobilières & sanitaires
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Option Douche (chambre / logement)
              </label>
              <select
                value={bathroomType}
                onChange={(e) => handleBathroomSelect(e.target.value as BathroomType)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              >
                {BATHROOM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Option WC / Toilettes
              </label>
              <select
                value={toiletType}
                onChange={(e) => setToiletType(e.target.value as ToiletType)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              >
                {TOILET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Ameublement
              </label>
              <select
                value={furnished}
                onChange={(e) => setFurnished(e.target.value as FurnishedType)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              >
                {FURNISHED_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Eau & Électricité (SEEN / NIGELEC)
              </label>
              <select
                value={waterElectricity}
                onChange={(e) => setWaterElectricity(e.target.value as WaterElectricityType)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              >
                {UTILITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Profil de locataire / colocataire souhaité
            </label>
            <select
              value={roommatePreference}
              onChange={(e) => setRoommatePreference(e.target.value as RoommatePreference)}
              className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            >
              {ROOMMATE_PREFERENCES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
            Description détaillée du logement
          </label>
          <textarea
            rows={4}
            maxLength={BLUEPRINT_LIMITS.LISTING_DESC_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Précisez la proximité avec l’UDM ou les axes goudronnés, l’état du carrelage/plafond, les espaces communs..."
            className="w-full px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
          />
        </div>

        <div>
          <span className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Équipements & atouts immobiliers
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {AMENITIES_OPTIONS.map((item) => {
              const active = amenities.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleAmenity(item)}
                  className={`min-h-[44px] flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer text-left ${
                    active
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/55 text-teal-800 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Check className={`w-4 h-4 shrink-0 ${active ? 'opacity-100' : 'opacity-25'}`} />
                  <span className="truncate">{item}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Real Photo Upload & Camera / URL Section */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Photos réelles du logement ({photos.length}/{BLUEPRINT_LIMITS.MAX_PHOTOS})
                {!isAdmin && ' — Au moins 1 photo obligatoire'}
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                Ajoutez des photos nettes de la pièce, de la cour ou de la douche. Optimisation auto 3G/4G.
              </p>
            </div>
            {photos.length < BLUEPRINT_LIMITS.MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => setShowPhotoUrlInput((v) => !v)}
                className="min-h-[38px] inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer whitespace-nowrap"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{showPhotoUrlInput ? 'Masquer le champ lien' : 'Ajouter par lien URL'}</span>
              </button>
            )}
          </div>

          {showPhotoUrlInput && photos.length < BLUEPRINT_LIMITS.MAX_PHOTOS && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={photoUrlDraft}
                onChange={(e) => setPhotoUrlDraft(e.target.value)}
                placeholder="https://exemple.com/photo-chambre.jpg"
                className="flex-1 min-h-[44px] px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              />
              <button
                type="button"
                onClick={handleAddPhotoByUrl}
                className="min-h-[44px] px-4 py-2 text-xs font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-[#93A3FF] dark:text-[#0B1437] dark:hover:bg-[#A6B3FF] rounded-xl cursor-pointer whitespace-nowrap"
              >
                Ajouter la photo
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photoUrl, idx) => (
              <div
                key={`${idx}-${photoUrl.slice(0, 24)}`}
                className="relative aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
              >
                <img
                  src={photoUrl}
                  alt={`Aperçu logement ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {idx === 0 ? (
                  <span className="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-md bg-slate-950/80 text-white text-[11px] font-bold">
                    Photo principale
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handlePromotePhotoCover(idx)}
                    title="Définir comme photo principale"
                    className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-950/80 hover:bg-teal-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    <ArrowUp className="w-3 h-3" />
                    <span>Couverture</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Retirer cette photo"
                  className="min-w-[34px] min-h-[34px] flex items-center justify-center absolute top-2 right-2 rounded-lg bg-slate-900/80 text-white hover:bg-red-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {photos.length < BLUEPRINT_LIMITS.MAX_PHOTOS && (
              <>
                <label className="aspect-[4/3] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 flex flex-col items-center justify-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer bg-slate-50 dark:bg-[#0B1437]/70 p-2 text-center">
                  <ImagePlus className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  <span className="font-bold">
                    {uploadingPhoto ? 'Compression...' : 'Importer photos'}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">Galerie ou fichiers</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploadingPhoto}
                    onChange={handlePhotoUpload}
                    className="sr-only"
                  />
                </label>

                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => {
                    setCameraModalMode('photo');
                    setCameraModalOpen(true);
                  }}
                  className="aspect-[4/3] rounded-xl border border-dashed border-teal-400 dark:border-teal-700 hover:border-teal-500 flex flex-col items-center justify-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer bg-teal-50/50 dark:bg-teal-950/35 p-2 text-center"
                >
                  <Camera className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  <span className="font-bold">Photographier la chambre</span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Caméra en direct
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Real Video Upload & Video Link Section */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>
                  Vidéos de visite du logement ({videos.length}/{BLUEPRINT_LIMITS.MAX_VIDEOS})
                </span>
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                Montrez la chambre, la douche interne/externe et la cour en vidéo pour rassurer les locataires.
              </p>
            </div>

            {videos.length < BLUEPRINT_LIMITS.MAX_VIDEOS && (
              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-[#0B1437] border border-slate-200/80 dark:border-slate-800 rounded-xl self-start">
                <button
                  type="button"
                  onClick={() => setVideoInputMode('file')}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    videoInputMode === 'file'
                      ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Importer / Filmer
                </button>
                <button
                  type="button"
                  onClick={() => setVideoInputMode('url')}
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    videoInputMode === 'url'
                      ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Lien vidéo (YouTube / Drive)
                </button>
              </div>
            )}
          </div>

          {videos.length < BLUEPRINT_LIMITS.MAX_VIDEOS && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-[#0B1437]/70 space-y-3">
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Légende de la vidéo (optionnel)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.VIDEO_TITLE_MAX}
                  value={videoTitleDraft}
                  onChange={(e) => setVideoTitleDraft(e.target.value)}
                  placeholder="Ex. Visite chambre, douche interne et cour"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                />
              </div>

              {videoInputMode === 'file' ? (
                <div className="space-y-3">
                  {videoProgress !== null ? (
                    <div className="p-3.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-white dark:bg-[#0F172A] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Optimisation vidéo pour lecture rapide 3G/4G...
                        </span>
                        <span className="font-mono font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                          {videoProgress}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-teal-600 transition-all duration-200"
                          style={{ width: `${videoProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => videoAbortRef.current?.abort()}
                          className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                        >
                          Annuler le traitement
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCameraModalMode('video');
                          setCameraModalOpen(true);
                        }}
                        className="min-h-[48px] flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed border-teal-400 dark:border-teal-700 hover:border-teal-500 bg-teal-50/50 dark:bg-teal-950/35 text-xs font-bold text-teal-800 dark:text-teal-300 cursor-pointer"
                      >
                        <Camera className="w-4 h-4 shrink-0" />
                        <span>Filmer la chambre en direct</span>
                      </button>

                      <label className="min-h-[48px] flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 bg-white dark:bg-[#0F172A] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <Video className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <span>Importer une vidéo</span>
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime,video/*"
                          onChange={handleVideoFileUpload}
                          className="sr-only"
                        />
                      </label>

                      <label className="min-h-[48px] flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 bg-white dark:bg-[#0F172A] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <Film className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <span>Caméra téléphone</span>
                        <input
                          type="file"
                          accept="video/*"
                          capture="environment"
                          onChange={handleVideoFileUpload}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  )}
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Les vidéos de votre appareil sont automatiquement compressées en extrait léger
                    (jusqu’à 12 s) pour un chargement rapide. Pour une visite longue, utilisez l’onglet
                    « Lien vidéo ».
                  </p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={videoUrlDraft}
                    onChange={(e) => setVideoUrlDraft(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... ou lien TikTok / Drive / MP4"
                    className="flex-1 min-h-[44px] px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                  />
                  <button
                    type="button"
                    onClick={handleAddVideoUrl}
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-[#93A3FF] dark:text-[#0B1437] dark:hover:bg-[#A6B3FF] rounded-xl cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ajouter la vidéo</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {videos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {videos.map((vid, idx) => (
                <div
                  key={vid.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1437]/80 overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-video bg-slate-950 flex items-center justify-center">
                    {vid.sourceType === 'clip' && vid.dataUrl ? (
                      <video
                        src={vid.dataUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                    ) : vid.sourceType === 'clip' ? (
                      <span className="text-xs font-medium text-slate-400">Chargement de l’aperçu vidéo...</span>
                    ) : (
                      <div className="p-4 text-center space-y-1">
                        <Film className="w-7 h-7 text-teal-400 mx-auto" />
                        <p className="text-xs font-semibold text-white truncate max-w-[240px]">
                          {vid.url}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        maxLength={BLUEPRINT_LIMITS.VIDEO_TITLE_MAX}
                        value={vid.title}
                        onChange={(e) =>
                          setVideos((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, title: e.target.value } : item,
                            ),
                          )
                        }
                        aria-label="Titre de la vidéo"
                        className="w-full text-xs font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent focus:border-teal-500 focus:outline-none pb-0.5"
                      />
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        {vid.sourceType === 'clip' ? 'Clip optimisé' : 'Lien externe'}
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        {formatDurationLabel(vid.durationSec)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveVideo(idx)}
                      aria-label="Retirer cette vidéo"
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Private Depositor & Verification Coordinates */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Informations obligatoires du déposant (confidentielles)
            </h3>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
              Vos coordonnées personnelles ne sont jamais affichées publiquement sur le site. Elles
              servent uniquement à la vérification par l’administrateur GidaColocs avant
              publication.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {DEPOSITOR_STATUS_OPTIONS.map((opt) => {
              const active = depositorStatus === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDepositorStatus(opt.value)}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-teal-500 bg-teal-50/75 dark:bg-teal-950/55'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{opt.label}</p>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Nom et prénom du déposant
              </label>
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ex. Moussa Abdoulaye"
                className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Quartier ou adresse du déposant
              </label>
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.DEPOSITOR_ADDRESS_MAX}
                value={depositorAddress}
                onChange={(e) => setDepositorAddress(e.target.value)}
                placeholder="Ex. Sabon Gari, près du marché"
                className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Numéro de téléphone principal
              </label>
              <input
                type="tel"
                required
                maxLength={BLUEPRINT_LIMITS.PHONE_MAX}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="70000000"
                className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Numéro WhatsApp (si différent)
              </label>
              <input
                type="tel"
                maxLength={BLUEPRINT_LIMITS.PHONE_MAX}
                value={contactWhatsapp}
                onChange={(e) => setContactWhatsapp(e.target.value)}
                placeholder="Optionnel si identique au téléphone"
                className="w-full min-h-[46px] px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              {depositorStatus === 'proprietaire'
                ? 'Précision ou justificatif complémentaire (optionnel)'
                : 'Justificatif / explication de votre autorisation à proposer ce logement (obligatoire)'}
            </label>
            <textarea
              rows={2}
              required={depositorStatus !== 'proprietaire'}
              maxLength={BLUEPRINT_LIMITS.AUTHORIZATION_NOTE_MAX}
              value={authorizationNote}
              onChange={(e) => setAuthorizationNote(e.target.value)}
              placeholder={
                depositorStatus === 'proprietaire'
                  ? 'Ex. Propriétaire résidant sur place, visite possible tous les jours...'
                  : 'Ex. Mandaté par le propriétaire Elh. Issoufou (lien familial ou accord direct pour louer la chambre)...'
              }
              className="w-full px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            />
          </div>
        </div>

        {isAdmin && !editingListing && (
          <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={publishImmediately}
              onChange={(e) => setPublishImmediately(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
            />
            <span>Publier immédiatement avec le badge « Vérifié GidaColocs » (Admin uniquement)</span>
          </label>
        )}

        {error && (
          <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm font-medium text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Publication gratuite · Aucun paiement requis
          </p>
          <button
            type="submit"
            disabled={saving || uploadingPhoto || videoProgress !== null}
            className="min-h-[48px] px-6 py-2.5 text-[15px] font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-[#93A3FF] dark:text-[#0B1437] dark:hover:bg-[#A6B3FF] disabled:opacity-60 rounded-xl shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            {saving
              ? 'Envoi en cours...'
              : editingListing
                ? editingListing.status === 'rejected' || editingListing.status === 'needs_correction'
                  ? 'Corriger et resoumettre'
                  : 'Mettre à jour l’annonce'
                : 'Soumettre gratuitement pour validation'}
          </button>
        </div>
      </form>
      </div>

      <CameraCaptureModal
        open={cameraModalOpen}
        initialMode={cameraModalMode}
        canAddPhoto={photos.length < BLUEPRINT_LIMITS.MAX_PHOTOS}
        canAddVideo={videos.length < BLUEPRINT_LIMITS.MAX_VIDEOS}
        onClose={() => setCameraModalOpen(false)}
        onCapturePhoto={(dataUrl) => {
          setPhotos((prev) => [...prev, dataUrl].slice(0, BLUEPRINT_LIMITS.MAX_PHOTOS));
        }}
        onCaptureVideo={(clip) => {
          const defaultTitle =
            videoTitleDraft.trim() || `Visite chambre en direct ${videos.length + 1}`;
          const newClipId = `clip_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          setVideos((prev) =>
            [
              ...prev,
              {
                id: newClipId,
                title: defaultTitle.slice(0, BLUEPRINT_LIMITS.VIDEO_TITLE_MAX),
                sourceType: 'clip' as const,
                url: '',
                clipId: newClipId,
                durationSec: clip.durationSec,
                mimeType: clip.mimeType,
                dataUrl: clip.dataUrl,
                isExistingClip: false,
              },
            ].slice(0, BLUEPRINT_LIMITS.MAX_VIDEOS),
          );
          setVideoTitleDraft('');
        }}
      />
    </div>
  );
}
