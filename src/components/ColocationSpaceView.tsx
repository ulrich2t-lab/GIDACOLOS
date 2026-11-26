import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  CheckCircle2,
  Edit3,
  Home,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
  formatFirestoreErrorMessage,
  OperationType,
  reportFirestoreError,
} from '../lib/firestoreError';
import {
  COLOC_DESIRED_TYPES,
  COLOC_GENDER_OPTIONS,
  LIFESTYLE_PRESETS,
  MARADI_NEIGHBORHOODS,
} from '../lib/constants';
import {
  COLOC_DESIRED_LABELS,
  COLOC_GENDER_LABELS,
  CONTENT_MODERATION_LABELS,
  formatFcfa,
  formatTimestamp,
  isSharedListingType,
} from '../lib/formatters';
import {
  createColocProfile,
  deleteColocProfile,
  postColocMessage,
  updateColocProfileDetails,
  updateColocProfileStatus,
} from '../lib/qolockService';
import { BLUEPRINT_LIMITS } from '../lib/validation';
import { readUrlParam, updateUrlParams } from '../lib/urlState';
import { useAuth } from '../context/AuthContext';
import { ListingCard } from './ListingCard';
import type {
  ColocDesiredType,
  ColocGenderPreference,
  ColocMessage,
  ColocProfile,
  Listing,
} from '../types/platform';

interface ColocationSpaceViewProps {
  listings: Listing[];
  colocProfiles: ColocProfile[];
  myColocProfiles?: ColocProfile[];
  onSelectListing: (listing: Listing) => void;
}

function ColocProfileThread({
  profileItem,
}: {
  profileItem: ColocProfile;
}) {
  const { user, profile, openAuthModal } = useAuth();
  const [approvedMessages, setApprovedMessages] = useState<ColocMessage[]>([]);
  const [myMessages, setMyMessages] = useState<ColocMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [threadNotice, setThreadNotice] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);

  useEffect(() => {
    const qApproved = query(
      collection(db, 'colocProfiles', profileItem.id, 'messages'),
      where('moderationStatus', '==', 'approved'),
    );
    const unsub = onSnapshot(
      qApproved,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ColocMessage, 'id'>),
        }));
        setApprovedMessages(list);
      },
      (err) =>
        setThreadError(
          reportFirestoreError(err, OperationType.LIST, `colocProfiles/${profileItem.id}/messages`),
        ),
    );
    return () => unsub();
  }, [profileItem.id]);

  useEffect(() => {
    if (!user) {
      setMyMessages([]);
      return;
    }
    const qMine = query(
      collection(db, 'colocProfiles', profileItem.id, 'messages'),
      where('authorId', '==', user.uid),
    );
    const unsub = onSnapshot(
      qMine,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ColocMessage, 'id'>),
        }));
        setMyMessages(list);
      },
      () => {
        // Non-blocking fallback
      },
    );
    return () => unsub();
  }, [user, profileItem.id]);

  const messages = useMemo(() => {
    const byId = new Map<string, ColocMessage>();
    for (const m of approvedMessages) byId.set(m.id, m);
    for (const m of myMessages) byId.set(m.id, m);
    return Array.from(byId.values()).sort((a, b) => {
      const tA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
      const tB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
      return tA - tB;
    });
  }, [approvedMessages, myMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim()) return;
    setSending(true);
    setThreadError(null);
    setThreadNotice(null);
    try {
      await postColocMessage(
        profileItem.id,
        profileItem.authorId,
        newMessage,
        user,
        profile?.displayName || user.displayName || 'Colocataire',
      );
      setNewMessage('');
      setThreadNotice(
        'Votre commentaire a été envoyé pour validation administrateur avant publication publique.',
      );
    } catch (err) {
      setThreadError(formatFirestoreErrorMessage(err, 'Impossible d’envoyer votre message.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/90 space-y-3">
      {messages.length > 0 && (
        <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
          {messages.map((m) => {
            const modStatus = m.moderationStatus || 'pending';
            return (
              <div
                key={m.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1437]/80 border border-slate-200/80 dark:border-slate-800 text-sm space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-900 dark:text-white truncate">
                      {m.authorName}
                    </span>
                    {modStatus !== 'approved' && (
                      <span
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-md ${
                          modStatus === 'rejected'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {CONTENT_MODERATION_LABELS[modStatus]}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-400 tabular-nums shrink-0">
                    {formatTimestamp(m.createdAt)}
                  </span>
                </div>
                <p className="text-[13.5px] font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                  {m.message}
                </p>
                {modStatus !== 'approved' && m.moderationReason && (
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Motif : {m.moderationReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {threadNotice && (
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{threadNotice}</p>
      )}
      {threadError && (
        <p className="text-xs font-semibold text-red-600 dark:text-red-400">{threadError}</p>
      )}

      {!user ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Connectez-vous pour commenter et échanger avec {profileItem.authorName}.
          </span>
          <button
            type="button"
            onClick={openAuthModal}
            className="min-h-[38px] px-3 text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer shrink-0"
          >
            Connexion
          </button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.COLOC_MESSAGE_MAX}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Écrire un message à ${profileItem.authorName}...`}
              className="flex-1 min-h-[44px] px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              aria-label="Envoyer"
              className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-[#93A3FF] dark:text-[#0B1437] dark:hover:bg-[#A6B3FF] disabled:opacity-50 rounded-xl cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Envoyer</span>
            </button>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Tout commentaire public est vérifié par l’administrateur avant affichage.
          </p>
        </form>
      )}
    </div>
  );
}

export function ColocationSpaceView({
  listings,
  colocProfiles,
  myColocProfiles = [],
  onSelectListing,
}: ColocationSpaceViewProps) {
  const { user, profile, isAdmin, openAuthModal } = useAuth();

  const [filterNeighborhood, setFilterNeighborhood] = useState(
    () => readUrlParam('colocQuartier') || 'all',
  );
  const [filterGender, setFilterGender] = useState<'all' | ColocGenderPreference>(
    () => (readUrlParam('colocProfil') as 'all' | ColocGenderPreference) || 'all',
  );
  const [openThreadId, setOpenThreadId] = useState<string | null>(
    () => readUrlParam('colocThread') || null,
  );

  const [showCreateForm, setShowCreateForm] = useState(
    () => readUrlParam('colocForm') === '1',
  );

  useEffect(() => {
    updateUrlParams(
      {
        colocQuartier: filterNeighborhood !== 'all' ? filterNeighborhood : null,
        colocProfil: filterGender !== 'all' ? filterGender : null,
        colocThread: openThreadId || null,
        colocForm: showCreateForm ? '1' : null,
      },
      'replace',
    );
  }, [filterNeighborhood, filterGender, openThreadId, showCreateForm]);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [targetNeighborhood, setTargetNeighborhood] = useState<string>(MARADI_NEIGHBORHOODS[2]);
  const [desiredType, setDesiredType] = useState<ColocDesiredType>('maison_partagee');
  const [maxBudgetFcfa, setMaxBudgetFcfa] = useState('15000');
  const [occupation, setOccupation] = useState('');
  const [genderPreference, setGenderPreference] = useState<ColocGenderPreference>('etudiants');
  const [lifestyle, setLifestyle] = useState('Calme et studieux, Non-fumeur');
  const [bio, setBio] = useState('');
  const [linkedListingId, setLinkedListingId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);

  const sharedListings = useMemo(
    () =>
      listings.filter(
        (item) =>
          item.status === 'published' &&
          (isSharedListingType(item.propertyType) ||
            item.propertyType === 'annexe' ||
            item.availableSpots > 1),
      ),
    [listings],
  );

  const filteredProfiles = useMemo(() => {
    return colocProfiles.filter((p) => {
      if (filterNeighborhood !== 'all' && p.targetNeighborhood !== filterNeighborhood) return false;
      if (filterGender !== 'all' && p.genderPreference !== filterGender) return false;
      return true;
    });
  }, [colocProfiles, filterNeighborhood, filterGender]);

  const handleToggleLifestyleTag = (tag: string) => {
    const current = lifestyle
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = current.includes(tag);
    const next = exists ? current.filter((t) => t !== tag) : [...current, tag];
    setLifestyle(next.join(', ').slice(0, BLUEPRINT_LIMITS.COLOC_LIFESTYLE_MAX));
  };

  const handleStartEditProfile = (item: ColocProfile) => {
    setEditingProfileId(item.id);
    setTargetNeighborhood(item.targetNeighborhood);
    setDesiredType(item.desiredType);
    setMaxBudgetFcfa(String(item.maxBudgetFcfa));
    setOccupation(item.occupation);
    setGenderPreference(item.genderPreference);
    setLifestyle(item.lifestyle);
    setBio(item.bio);
    setLinkedListingId(item.linkedListingId || '');
    setFormError(null);
    setFormSuccess(null);
    setShowCreateForm(true);
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);
    try {
      const payload = {
        targetNeighborhood,
        desiredType,
        maxBudgetFcfa: Number(maxBudgetFcfa) || 15000,
        occupation,
        genderPreference,
        lifestyle,
        bio,
        linkedListingId,
      };
      if (editingProfileId) {
        await updateColocProfileDetails(
          editingProfileId,
          payload,
          user,
          profile?.displayName || user.displayName || 'Colocataire',
        );
        setFormSuccess(
          'Profil mis à jour et envoyé en validation administrateur avant publication publique.',
        );
      } else {
        await createColocProfile(
          payload,
          user,
          profile?.displayName || user.displayName || 'Colocataire',
        );
        setFormSuccess(
          'Votre profil colocataire a été soumis ! Il apparaîtra publiquement dès validation par l’administrateur.',
        );
      }
      setEditingProfileId(null);
      setOccupation('');
      setBio('');
      setLinkedListingId('');
      setShowCreateForm(false);
    } catch (err) {
      setFormError(formatFirestoreErrorMessage(err, 'Erreur lors de la publication.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleProfileStatus = async (item: ColocProfile) => {
    if (!user) return;
    setBusyProfileId(item.id);
    setBoardError(null);
    try {
      await updateColocProfileStatus(
        item.id,
        item.status === 'active' ? 'found' : 'active',
        user,
        profile?.displayName || user.displayName || 'Utilisateur',
      );
    } catch (err) {
      setBoardError(formatFirestoreErrorMessage(err, 'Impossible de modifier ce profil.'));
    } finally {
      setBusyProfileId(null);
    }
  };

  const handleDeleteProfile = async (itemId: string) => {
    if (!user) return;
    setBusyProfileId(itemId);
    setBoardError(null);
    try {
      await deleteColocProfile(
        itemId,
        user,
        profile?.displayName || user.displayName || 'Utilisateur',
      );
    } catch (err) {
      setBoardError(formatFirestoreErrorMessage(err, 'Impossible de supprimer ce profil.'));
    } finally {
      setBusyProfileId(null);
    }
  };

  return (
    <div className="space-y-10">
      {/* Header Banner */}
      <section className="hero-diamond-pattern text-white border border-indigo-400/20 rounded-3xl p-6 sm:p-8 lg:p-10 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-300">
            Espace Rencontre Colocataires · Maradi
          </p>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight text-balance">
            Rencontrez vos futurs colocataires pour partager une maison ou une annexe.
          </h1>
          <p className="text-[15px] text-slate-200 leading-relaxed font-medium">
            Consultez les profils d’étudiants de l’UDM et de jeunes actifs à Maradi, discutez sur
            leur fiche et organisez ensemble la location d’une maison à partager.
          </p>
        </div>

        <div className="shrink-0">
          {!user ? (
            <button
              type="button"
              onClick={openAuthModal}
              className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-[#0B1437] bg-[#93A3FF] hover:bg-[#A6B3FF] rounded-xl shadow-md transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Se connecter pour publier un profil</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingProfileId(null);
                setFormSuccess(null);
                setShowCreateForm((v) => !v);
              }}
              className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-[#0B1437] bg-[#93A3FF] hover:bg-[#A6B3FF] rounded-xl shadow-md transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{showCreateForm ? 'Fermer le formulaire' : 'Publier mon profil colocataire'}</span>
            </button>
          )}
        </div>
      </section>

      {formSuccess && (
        <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{formSuccess}</span>
        </div>
      )}

      {/* Mes profils colocataires soumis (y compris en attente / refusés / à corriger) */}
      {user && myColocProfiles.length > 0 && (
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Mes profils colocataires soumis ({myColocProfiles.length})
            </h2>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Validation administrateur requise avant affichage public
            </span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {myColocProfiles.map((p) => {
              const modStatus = p.moderationStatus || 'pending';
              return (
                <div
                  key={p.id}
                  className="p-4 bg-slate-50/70 dark:bg-[#0B1437]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {p.targetNeighborhood} · {COLOC_DESIRED_LABELS[p.desiredType]}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-md ${
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
                    <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300 truncate">
                      {p.occupation} · ≤ {formatFcfa(p.maxBudgetFcfa)}
                    </p>
                    {p.moderationReason && modStatus !== 'approved' && (
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        Message administrateur : {p.moderationReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEditProfile(p)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0B1437] dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{modStatus === 'needs_correction' || modStatus === 'rejected' ? 'Corriger' : 'Modifier'}</span>
                    </button>
                    {modStatus === 'approved' && (
                      <button
                        type="button"
                        disabled={busyProfileId === p.id}
                        onClick={() => void handleToggleProfileStatus(p)}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl cursor-pointer"
                      >
                        {p.status === 'active' ? 'Marquer trouvé' : 'Réactiver'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyProfileId === p.id}
                      onClick={() => void handleDeleteProfile(p.id)}
                      aria-label="Supprimer mon profil colocation"
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 cursor-pointer rounded-xl"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Form to Create / Edit Roommate Search Profile */}
      {showCreateForm && user && (
        <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-6 sm:p-8 max-w-3xl shadow-sm">
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white mb-2">
            {editingProfileId
              ? 'Modifier mon profil de colocation'
              : 'Publier ma recherche de colocation à Maradi'}
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-5">
            Votre profil sera vérifié et approuvé par l’administrateur avant d’apparaître publiquement.
          </p>
          {formError && (
            <div className="mb-4 p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm font-medium text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}
          <form onSubmit={handleCreateProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Quartier recherché
                </label>
                <select
                  value={targetNeighborhood}
                  onChange={(e) => setTargetNeighborhood(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
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
                  Type de logement souhaité
                </label>
                <select
                  value={desiredType}
                  onChange={(e) => setDesiredType(e.target.value as ColocDesiredType)}
                  className="w-full min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                >
                  {COLOC_DESIRED_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Budget max par personne (FCFA)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={5000000}
                  step={500}
                  value={maxBudgetFcfa}
                  onChange={(e) => setMaxBudgetFcfa(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Préférence de colocation
                </label>
                <select
                  value={genderPreference}
                  onChange={(e) => setGenderPreference(e.target.value as ColocGenderPreference)}
                  className="w-full min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                >
                  {COLOC_GENDER_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Votre statut / filière / activité
                </label>
                <input
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.COLOC_OCCUPATION_MAX}
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="Ex. Étudiant Génie Civil UDM ou Comptable"
                  className="w-full min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  Lier à une maison à partager existante (optionnel)
                </label>
                <select
                  value={linkedListingId}
                  onChange={(e) => setLinkedListingId(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                >
                  <option value="">Aucune annonce ciblée pour l’instant</option>
                  {sharedListings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} ({l.neighborhood})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Rythme de vie & habitudes
              </label>
              <div className="flex flex-wrap gap-2 mb-2.5">
                {LIFESTYLE_PRESETS.map((tag) => {
                  const active = lifestyle.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleLifestyleTag(tag)}
                      className={`min-h-[38px] px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                        active
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.COLOC_LIFESTYLE_MAX}
                value={lifestyle}
                onChange={(e) => setLifestyle(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Présentation & ce que vous recherchez
              </label>
              <textarea
                rows={3}
                required
                maxLength={BLUEPRINT_LIMITS.COLOC_BIO_MAX}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Expliquez quand vous souhaitez emménager, le nombre de colocataires souhaité, etc."
                className="w-full px-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437]/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingProfileId(null);
                }}
                className="min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] px-5 py-2 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-teal-500 dark:text-[#060B1D] dark:hover:bg-teal-400 rounded-xl cursor-pointer"
              >
                {submitting ? 'Envoi...' : 'Soumettre pour validation'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Roommate Candidates Board */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Personnes à la recherche d’une colocation ({filteredProfiles.length})
            </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Discutez directement avec les candidats pour former un groupe et visiter ensemble
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={filterNeighborhood}
              onChange={(e) => setFilterNeighborhood(e.target.value)}
              aria-label="Filtrer les profils par quartier"
              className="min-h-[44px] px-3.5 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            >
              <option value="all">Tous les quartiers</option>
              {MARADI_NEIGHBORHOODS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>

            <select
              value={filterGender}
              onChange={(e) =>
                setFilterGender(e.target.value as 'all' | ColocGenderPreference)
              }
              aria-label="Filtrer par préférence"
              className="min-h-[44px] px-3.5 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
            >
              <option value="all">Toutes préférences</option>
              {COLOC_GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {boardError && (
          <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm font-medium text-red-700 dark:text-red-300">
            {boardError}
          </div>
        )}

        {filteredProfiles.length === 0 ? (
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-10 text-center space-y-3">
            <p className="text-base font-bold text-slate-900 dark:text-white">
              Aucun profil de colocataire publié pour ces critères
            </p>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Publiez votre annonce de recherche de colocataire pour attirer des étudiants ou
              jeunes actifs dans votre quartier à Maradi.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredProfiles.map((item) => {
              const linkedListing = item.linkedListingId
                ? listings.find((l) => l.id === item.linkedListingId)
                : undefined;
              const isMine = user && (user.uid === item.authorId || isAdmin);
              const isThreadOpen = openThreadId === item.id;

              return (
                <article
                  key={item.id}
                  className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-sm hover:border-teal-600/60 dark:hover:border-teal-400/50 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[17px] font-bold text-slate-900 dark:text-white">
                          {item.authorName}
                        </p>
                        <p className="text-xs text-teal-700 dark:text-teal-300 font-semibold mt-0.5">
                          {item.occupation} · {COLOC_GENDER_LABELS[item.genderPreference]}
                        </p>
                      </div>
                      <span className="text-base font-extrabold text-[#0B1437] dark:text-[#93A3FF] tabular-nums shrink-0">
                        ≤ {formatFcfa(item.maxBudgetFcfa)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 font-semibold">
                        <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>{item.targetNeighborhood}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{COLOC_DESIRED_LABELS[item.desiredType]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatTimestamp(item.createdAt)}</span>
                    </div>

                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.bio}
                    </p>

                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Mode de vie : {item.lifestyle}
                    </p>

                    {linkedListing && (
                      <button
                        type="button"
                        onClick={() => onSelectListing(linkedListing)}
                        className="w-full min-h-[44px] p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B1437]/80 flex items-center justify-between gap-2 text-left hover:border-teal-600 cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          <Home className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span className="truncate">{linkedListing.title}</span>
                        </span>
                        <span className="text-xs font-bold text-teal-700 dark:text-teal-300 shrink-0">
                          Voir le bien →
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/90">
                      <button
                        type="button"
                        onClick={() => setOpenThreadId(isThreadOpen ? null : item.id)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 text-xs font-bold text-[#0B1437] dark:text-teal-300 hover:underline cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>{isThreadOpen ? 'Masquer les échanges' : 'Échanger / Proposer une coloc'}</span>
                      </button>

                      {isMine && user && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyProfileId === item.id}
                            onClick={() => void handleToggleProfileStatus(item)}
                            className="min-h-[38px] inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:underline disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {item.status === 'active' ? 'Marquer trouvé' : 'Réactiver'}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={busyProfileId === item.id}
                            onClick={() => void handleDeleteProfile(item.id)}
                            aria-label="Supprimer le profil"
                            className="min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 disabled:opacity-50 cursor-pointer rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {isThreadOpen && <ColocProfileThread profileItem={item} />}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Maisons à partager & Annexes ouvertes */}
      {sharedListings.length > 0 && (
        <section className="space-y-5">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Maisons à partager & annexes disponibles ({sharedListings.length})
            </h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              Cliquez sur un bien pour voir les candidats déjà intéressés et rejoindre la
              colocation
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sharedListings.map((item) => (
              <ListingCard key={item.id} listing={item} onSelect={onSelectListing} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
