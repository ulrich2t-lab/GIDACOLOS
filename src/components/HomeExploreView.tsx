import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Home,
  Lock,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import { MARADI_NEIGHBORHOODS, OFFICIAL_WHATSAPP_GROUP_URL, PROPERTY_TYPES } from '../lib/constants';
import { buildWhatsAppUrl, COLOC_GENDER_LABELS, formatFcfa, formatTimestamp } from '../lib/formatters';
import { formatFirestoreErrorMessage } from '../lib/firestoreError';
import { adminInitializeStarterListings } from '../lib/qolockService';
import { useAuth } from '../context/AuthContext';
import { ListingCard } from './ListingCard';
import type {
  BathroomType,
  ColocProfile,
  Listing,
  PlatformConfig,
  PropertyType,
} from '../types/platform';

const PAGE_BATCH_SIZE = 12;
const BUDGET_MIN = 10000;
const BUDGET_MAX = 150000;
const BUDGET_STEP = 5000;
const QUICK_NEIGHBORHOODS = ['Sabon Gari', 'Ali Dan Sofo', 'Zaria', 'Maradawa', 'Zone UDM'];

interface HomeExploreViewProps {
  listings: Listing[];
  colocProfiles?: ColocProfile[];
  loading: boolean;
  config: PlatformConfig;
  onSelectListing: (listing: Listing) => void;
  onGoToPublish: () => void;
  onGoToColocation: () => void;
  onGoToAccount: () => void;
}

export function HomeExploreView({
  listings,
  colocProfiles = [],
  loading,
  config,
  onSelectListing,
  onGoToPublish,
  onGoToColocation,
  onGoToAccount,
}: HomeExploreViewProps) {
  const { user, profile, isAdmin, openAuthModal } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | PropertyType>('all');
  const [selectedBathroom, setSelectedBathroom] = useState<'all' | BathroomType>('all');
  const [maxBudget, setMaxBudget] = useState<number>(BUDGET_MAX);
  const [availabilityFilter, setAvailabilityFilter] = useState<'active' | 'published' | 'all'>(
    'active',
  );
  const [visibleLimit, setVisibleLimit] = useState(PAGE_BATCH_SIZE);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    setVisibleLimit(PAGE_BATCH_SIZE);
  }, [
    searchQuery,
    selectedNeighborhood,
    selectedType,
    selectedBathroom,
    maxBudget,
    availabilityFilter,
  ]);

  const neighborhoodCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of MARADI_NEIGHBORHOODS) counts[q] = 0;
    for (const item of listings) {
      if (item.status === 'published') {
        counts[item.neighborhood] = (counts[item.neighborhood] || 0) + 1;
      }
    }
    return counts;
  }, [listings]);

  const featuredTopListings = useMemo(
    () => listings.filter((item) => item.status === 'published' && item.isTop).slice(0, 3),
    [listings],
  );

  const recentlyApprovedListings = useMemo(
    () => listings.filter((item) => item.status === 'published').slice(0, 3),
    [listings],
  );

  const hasBudgetFilter = maxBudget < BUDGET_MAX;

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      selectedNeighborhood !== 'all' ||
      selectedType !== 'all' ||
      selectedBathroom !== 'all' ||
      hasBudgetFilter ||
      availabilityFilter !== 'active',
  );

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = listings.filter((item) => {
      if (availabilityFilter === 'published' && item.status !== 'published') return false;
      if (availabilityFilter === 'active' && item.status !== 'published' && item.status !== 'reserved') {
        return false;
      }
      if (selectedNeighborhood !== 'all' && item.neighborhood !== selectedNeighborhood) return false;
      if (selectedType !== 'all') {
        if (selectedType === 'maison_partagee') {
          if (item.propertyType !== 'maison_partagee' && item.propertyType !== 'colocation') {
            return false;
          }
        } else if (item.propertyType !== selectedType) {
          return false;
        }
      }
      if (selectedBathroom !== 'all' && item.bathroomType !== selectedBathroom) return false;
      if (hasBudgetFilter && item.priceFcfa > maxBudget) return false;
      if (q) {
        const hay = `${item.title} ${item.neighborhood} ${item.locationDetails || ''} ${item.description} ${item.amenities.join(' ')} ${item.houseRules || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const rankStatus = (status: Listing['status']) => {
      if (status === 'published') return 0;
      if (status === 'reserved') return 1;
      return 2;
    };

    return [...list].sort((a, b) => {
      const rankDiff = rankStatus(a.status) - rankStatus(b.status);
      if (rankDiff !== 0) return rankDiff;
      if (a.isTop !== b.isTop) return a.isTop ? -1 : 1;
      return 0;
    });
  }, [
    listings,
    availabilityFilter,
    selectedNeighborhood,
    selectedType,
    selectedBathroom,
    hasBudgetFilter,
    maxBudget,
    searchQuery,
  ]);

  const paginatedListings = useMemo(
    () => filteredListings.slice(0, visibleLimit),
    [filteredListings, visibleLimit],
  );
  const remainingCount = Math.max(0, filteredListings.length - paginatedListings.length);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedNeighborhood('all');
    setSelectedType('all');
    setSelectedBathroom('all');
    setMaxBudget(BUDGET_MAX);
    setAvailabilityFilter('active');
  };

  const handleSeedStarters = async () => {
    if (!user || !isAdmin || seeding) return;
    setSeeding(true);
    setSeedError(null);
    try {
      await adminInitializeStarterListings(
        user,
        profile?.displayName || user.displayName || 'Administrateur',
      );
    } catch (err) {
      setSeedError(formatFirestoreErrorMessage(err, 'Impossible d’initialiser les logements.'));
    } finally {
      setSeeding(false);
    }
  };

  const whatsappSupportUrlPrimary = buildWhatsAppUrl(
    config.whatsappNumber || '2290157382961',
    'Bonjour GidaColocs, je souhaite être accompagné(e) pour trouver un logement à Maradi.',
  );
  const whatsappSecondary = config.whatsappSecondaryNumber || '22776688125';
  const whatsappSupportUrlSecondary = buildWhatsAppUrl(
    whatsappSecondary,
    'Bonjour GidaColocs, je souhaite être accompagné(e) pour trouver un logement à Maradi.',
  );
  const communityGroupUrl = config.whatsappGroupUrl || OFFICIAL_WHATSAPP_GROUP_URL;

  const activeAvailableCount = useMemo(
    () => listings.filter((l) => l.status === 'published').length,
    [listings],
  );

  const budgetPercent = ((maxBudget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  return (
    <div className="space-y-10 sm:space-y-14">
      {/* Architectural Navy Geometric Hero + Elevated Search Card */}
      <section className="hero-diamond-pattern text-white rounded-3xl border border-indigo-400/20 overflow-hidden shadow-xl shadow-slate-950/20">
        <div className="px-5 py-7 sm:px-8 sm:py-10 lg:px-10 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-10 items-center">
          {/* Editorial Proposition */}
          <div className="lg:col-span-7 space-y-5">
            <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-teal-300">
              Maradi, Niger · Logements vérifiés &amp; Colocation
            </p>

            <h1 className="text-[32px] sm:text-4xl lg:text-[48px] font-extrabold text-white leading-[1.08] tracking-tight text-balance">
              Une chambre à Maradi, un loyer partagé.
            </h1>

            <p className="text-[15.5px] sm:text-[17px] font-medium text-slate-200 leading-[1.6] max-w-xl">
              Étudiants et jeunes actifs : trouvez votre logement ou colocation vérifiée, contactez
              en toute sécurité et évitez les longs mois d’avance.
            </p>

            {/* Quick Facts & Primary Desktop/Mobile Actions */}
            <div className="pt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] font-semibold text-slate-200 tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-300 shrink-0" />
                <span>{activeAvailableCount} logements vérifiés</span>
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span>Dépôt gratuit (0 FCFA)</span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span>Pass Visite {formatFcfa(config.visitPassPrice)}</span>
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onGoToPublish}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold bg-teal-400 hover:bg-teal-300 text-[#0B1437] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Publier gratuitement</span>
              </button>

              <button
                type="button"
                onClick={onGoToColocation}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold border border-white/25 hover:bg-white/10 text-white rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Users className="w-4 h-4 text-indigo-300" />
                <span>Trouver un colocataire</span>
              </button>
            </div>
          </div>

          {/* Elevated Interactive Search Card */}
          <div className="lg:col-span-5">
            <div className="bg-[#111B40]/95 backdrop-blur-md border border-indigo-300/20 rounded-2xl p-5 sm:p-6 shadow-2xl shadow-black/30 space-y-4">
              {/* Optional Keyword Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Mot-clé (douche interne, UDM...)"
                  aria-label="Rechercher par mot-clé"
                  className="w-full min-h-[48px] pl-10 pr-3.5 py-2.5 text-[15px] font-medium rounded-xl border border-indigo-300/20 bg-[#0B1437]/85 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                />
              </div>

              {/* Neighborhood Select */}
              <div className="relative">
                <select
                  value={selectedNeighborhood}
                  onChange={(e) => setSelectedNeighborhood(e.target.value)}
                  aria-label="Sélectionner un quartier"
                  className="w-full min-h-[50px] appearance-none pl-4 pr-10 py-2.5 text-[15px] font-medium rounded-xl border border-indigo-300/20 bg-[#0B1437]/85 text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF] cursor-pointer"
                >
                  <option value="all">Tous les quartiers</option>
                  {MARADI_NEIGHBORHOODS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-300 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Property Type Select */}
              <div className="relative">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as 'all' | PropertyType)}
                  aria-label="Sélectionner un type de logement"
                  className="w-full min-h-[50px] appearance-none pl-4 pr-10 py-2.5 text-[15px] font-medium rounded-xl border border-indigo-300/20 bg-[#0B1437]/85 text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF] cursor-pointer"
                >
                  <option value="all">Tous les types</option>
                  {PROPERTY_TYPES.map((pt) => (
                    <option key={pt.value} value={pt.value}>
                      {pt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-300 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Interactive Budget Slider */}
              <div className="pt-1 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[14.5px]">
                  <label htmlFor="hero-budget-slider" className="font-semibold text-slate-100">
                    Budget max :{' '}
                    <span className="text-[#93A3FF] font-bold tabular-nums">
                      {maxBudget >= BUDGET_MAX ? 'Tout budget' : formatFcfa(maxBudget)}
                    </span>
                  </label>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-xs font-semibold text-teal-300 hover:underline cursor-pointer"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>

                <input
                  id="hero-budget-slider"
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(Number(e.target.value))}
                  aria-label="Budget maximum en FCFA"
                  style={{
                    background: `linear-gradient(to right, #6366F1 0%, #6366F1 ${budgetPercent}%, rgba(255,255,255,0.22) ${budgetPercent}%, rgba(255,255,255,0.22) 100%)`,
                  }}
                  className="budget-slider w-full"
                />
              </div>

              {/* Primary Search Button */}
              <button
                type="button"
                onClick={() => scrollToSection('logements')}
                className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-bold text-[#0B1437] bg-[#93A3FF] hover:bg-[#A6B4FF] active:scale-[0.99] rounded-xl shadow-lg shadow-indigo-950/40 transition-all cursor-pointer"
              >
                <Search className="w-4 h-4 stroke-[2.5]" />
                <span>Rechercher</span>
              </button>

              {/* Quick Neighborhood Filter Buttons */}
              <div className="pt-1 flex flex-wrap gap-2">
                {QUICK_NEIGHBORHOODS.map((q) => {
                  const active = selectedNeighborhood === q;
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setSelectedNeighborhood(active ? 'all' : q);
                      }}
                      className={`min-h-[38px] px-3.5 py-1.5 text-[13px] font-semibold rounded-xl border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#93A3FF] border-[#93A3FF] text-[#0B1437]'
                          : 'bg-[#0B1437]/70 border-indigo-300/20 text-slate-100 hover:border-indigo-300/50'
                      }`}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured TOP Listings & Recently Approved Highlights (shown immediately when unfiltered) */}
      {!loading && !hasActiveFilters && featuredTopListings.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-current shrink-0" />
                <span>Annonces mises en avant</span>
              </h2>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                Logements approuvés bénéficiant d’une mise en avant TOP sur GidaColocs
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredTopListings.map((item) => (
              <ListingCard key={`top-${item.id}`} listing={item} onSelect={onSelectListing} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Approved Showcase */}
      {!loading && !hasActiveFilters && recentlyApprovedListings.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>Récemment approuvées</span>
              </h2>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                Derniers logements contrôlés et validés par GidaColocs
              </p>
            </div>
            <button
              type="button"
              onClick={() => scrollToSection('logements')}
              className="text-sm font-bold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>Tout voir</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentlyApprovedListings.map((item) => (
              <ListingCard key={`recent-${item.id}`} listing={item} onSelect={onSelectListing} />
            ))}
          </div>
        </section>
      )}

      {/* Listings Catalog with Categories & Progressive Pagination */}
      <section id="logements" className="space-y-6 scroll-mt-20">
        <div className="flex flex-col gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Catalogue des logements à Maradi
              </h2>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-0.5 tabular-nums">
                {filteredListings.length} logement{filteredListings.length > 1 ? 's' : ''} trouvé
                {filteredListings.length > 1 ? 's' : ''}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="ml-3 text-teal-700 dark:text-teal-400 font-bold hover:underline cursor-pointer"
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={selectedBathroom}
                onChange={(e) => setSelectedBathroom(e.target.value as 'all' | BathroomType)}
                aria-label="Filtrer par type de douche"
                className="min-h-[42px] px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <option value="all">Douche : Toutes</option>
                <option value="interne">Douche interne</option>
                <option value="externe">Douche externe</option>
                <option value="partagee">Douche partagée</option>
              </select>

              <div className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={availabilityFilter}
                  onChange={(e) =>
                    setAvailabilityFilter(e.target.value as 'active' | 'published' | 'all')
                  }
                  aria-label="Filtrer par disponibilité"
                  className="min-h-[42px] px-3.5 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  <option value="active">Disponibles &amp; Réservés</option>
                  <option value="published">Disponibles uniquement</option>
                  <option value="all">Inclure les pris / loués</option>
                </select>
              </div>
            </div>
          </div>

          {/* Property Type Categories */}
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/75 dark:bg-[#0F172A] border border-slate-200/60 dark:border-slate-800/90 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedType('all')}
              className={`min-h-[40px] px-3.5 py-2 text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                selectedType === 'all'
                  ? 'bg-white dark:bg-[#0B1437] text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-indigo-400/25'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Tous les biens
            </button>
            {PROPERTY_TYPES.map((pt) => (
              <button
                key={pt.value}
                type="button"
                onClick={() => setSelectedType(pt.value)}
                className={`min-h-[40px] px-3.5 py-2 text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  selectedType === pt.value
                    ? 'bg-white dark:bg-[#0B1437] text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-indigo-400/25'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
              >
                <div className="aspect-[4/3] bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                  <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Aucun logement ne correspond à ces critères
            </h3>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 max-w-md mx-auto">
              {listings.length === 0
                ? 'La base publique ne contient pas encore d’annonces publiées. Vous pouvez soumettre un logement ou initialiser des biens de référence.'
                : 'Essayez d’élargir votre budget ou de réinitialiser le filtre de quartier ou de type.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {listings.length > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="min-h-[44px] px-5 py-2.5 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:text-white rounded-xl cursor-pointer"
                >
                  Réinitialiser les filtres
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onGoToPublish}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-teal-500 dark:text-[#0B1437] rounded-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Publier le premier logement</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={seeding}
                      onClick={handleSeedStarters}
                      className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-xl cursor-pointer"
                    >
                      <span>
                        {seeding
                          ? 'Publication en cours...'
                          : 'Publier 4 logements de référence (Maradi)'}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
            {seedError && (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{seedError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedListings.map((item) => (
                <ListingCard key={item.id} listing={item} onSelect={onSelectListing} />
              ))}
            </div>

            {remainingCount > 0 && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((prev) => prev + PAGE_BATCH_SIZE)}
                  className="min-h-[46px] inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-[#0B1437] dark:text-white bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl shadow-xs transition-colors cursor-pointer tabular-nums"
                >
                  <span>
                    Afficher plus de logements ({Math.min(PAGE_BATCH_SIZE, remainingCount)} sur{' '}
                    {remainingCount} restants)
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Quartiers Stratégiques de Maradi */}
      <section id="quartiers" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Quartiers couverts à Maradi
            </h2>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-0.5">
              Touchez un quartier pour filtrer directement les offres disponibles
            </p>
          </div>
          {selectedNeighborhood !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedNeighborhood('all')}
              className="text-sm font-bold text-teal-700 dark:text-teal-400 hover:underline self-start sm:self-auto cursor-pointer"
            >
              Afficher tous les quartiers
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {MARADI_NEIGHBORHOODS.slice(0, 5).map((q) => {
            const active = selectedNeighborhood === q;
            return (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setSelectedNeighborhood(active ? 'all' : q);
                  if (!active) scrollToSection('logements');
                }}
                className={`min-h-[78px] p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/50'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
                    {q}
                  </span>
                  <MapPin
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
                    }`}
                  />
                </div>
                <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                  {neighborhoodCounts[q] || 0} disponible{(neighborhoodCounts[q] || 0) > 1 ? 's' : ''}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Streamlined 4-Card Quick Actions */}
      <section aria-label="Parcours rapides" className="space-y-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Accès rapide
          </h2>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-0.5">
            Accédez directement au service adapté à votre besoin à Maradi
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => {
              setSelectedType('chambre');
              setAvailabilityFilter('published');
              scrollToSection('logements');
            }}
            className="min-h-[96px] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] hover:border-indigo-400 text-left flex flex-col justify-between gap-3 transition-colors cursor-pointer"
          >
            <Home className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              Chercher une chambre
            </span>
          </button>

          <button
            type="button"
            onClick={onGoToPublish}
            className="min-h-[96px] p-4 sm:p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 hover:border-emerald-500 text-left flex flex-col justify-between gap-3 transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              Publier un logement
            </span>
          </button>

          <button
            type="button"
            onClick={onGoToColocation}
            className="min-h-[96px] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] hover:border-indigo-400 text-left flex flex-col justify-between gap-3 transition-colors cursor-pointer"
          >
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              Trouver un colocataire
            </span>
          </button>

          <button
            type="button"
            onClick={() => (user ? onGoToAccount() : openAuthModal())}
            className="min-h-[96px] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] hover:border-indigo-400 text-left flex flex-col justify-between gap-3 transition-colors cursor-pointer"
          >
            <Building2 className="w-5 h-5 text-[#0B1437] dark:text-sky-400" />
            <span className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              Mes annonces &amp; reçus
            </span>
          </button>
        </div>
      </section>

      {/* Roommate Finder & Community Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-7 flex flex-col justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Colocation GidaColocs
              </p>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                Trouver un colocataire à Maradi
              </h2>
            </div>
            <button
              type="button"
              onClick={onGoToColocation}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-[#0B1437] rounded-xl transition-colors cursor-pointer shrink-0 self-start"
            >
              <Users className="w-4 h-4" />
              <span>Voir l’espace colocation</span>
            </button>
          </div>

          {colocProfiles.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {colocProfiles.slice(0, 2).map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B1437] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-slate-900 dark:text-white truncate">
                        {p.authorName}
                      </p>
                      <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 truncate">
                        {p.occupation} · {COLOC_GENDER_LABELS[p.genderPreference]}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[#0B1437] dark:text-white tabular-nums shrink-0">
                      ≤ {formatFcfa(p.maxBudgetFcfa)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300 line-clamp-2">
                    {p.bio}
                  </p>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {p.targetNeighborhood} · {formatTimestamp(p.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
              Publiez gratuitement votre profil de recherche ou consultez les étudiants de l’UDM et
              jeunes actifs cherchant à partager une maison ou une annexe.
            </p>
          )}
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-7 flex flex-col justify-between gap-5">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Communauté &amp; Entraide
            </p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Groupe officiel WhatsApp GidaColocs
            </h2>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
              Adhérez directement au groupe WhatsApp GidaColocs pour recevoir les alertes de
              nouveaux logements vérifiés et échanger avec des colocataires à Maradi.
            </p>
          </div>

          <div className="space-y-2.5">
            <a
              href={communityGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>Rejoindre le groupe WhatsApp</span>
            </a>

            <a
              href={whatsappSupportUrlPrimary}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors tabular-nums"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Contacter l’assistance</span>
            </a>

            {whatsappSecondary && whatsappSecondary !== config.whatsappNumber && (
              <a
                href={whatsappSupportUrlSecondary}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 rounded-xl transition-colors tabular-nums"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>WhatsApp Niger ({whatsappSecondary})</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Platform Advantages + Transparent Tariffs + Free Publishing CTA */}
      <section className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Pourquoi choisir GidaColocs à Maradi ?
            </h2>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-1">
              Une plateforme claire, vérifiée et accessible sur téléphone comme sur ordinateur.
            </p>
          </div>

          <button
            type="button"
            onClick={onGoToPublish}
            className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-[#0B1437] rounded-xl cursor-pointer self-start shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Déposer une annonce (0 FCFA)</span>
          </button>
        </div>

        {/* 3 Key Advantages */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
                Validation manuelle obligatoire
              </h3>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Chaque annonce est contrôlée (photos, prix, identité) avant sa mise en ligne
                publique.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-[#0B1437] dark:text-indigo-300" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
                Protection des données privées
              </h3>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Les coordonnées des bailleurs restent privées et ne sont débloquées qu’après
                validation.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
                Connexion WhatsApp simple
              </h3>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Connectez-vous avec votre numéro WhatsApp et un code simple, ou en 1 clic via
                Google.
              </p>
            </div>
          </div>
        </div>

        {/* Transparent Tariffs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 flex flex-col justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Pour bailleurs &amp; démarcheurs
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1.5">
                Publication ·{' '}
                <span className="text-emerald-700 dark:text-emerald-400">Gratuite (0 FCFA)</span>
              </h3>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Déposez chambres, studios, appartements, maisons et annexes gratuitement après
                contrôle.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToPublish}
              className="text-left text-sm font-bold text-emerald-800 dark:text-emerald-300 hover:underline cursor-pointer"
            >
              Publier gratuitement →
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B1437] flex flex-col justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700 dark:text-teal-400">
                Pour étudiants &amp; locataires
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1.5">
                Pass visite ·{' '}
                <span className="tabular-nums">{formatFcfa(config.visitPassPrice)}</span>
              </h3>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Débloque le numéro vérifié du bailleur et l’accompagnement visite après validation.
              </p>
            </div>
            <a
              href="#logements"
              className="text-sm font-bold text-[#0B1437] dark:text-teal-400 hover:underline"
            >
              Choisir un logement →
            </a>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B1437] flex flex-col justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                Option facultative
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1.5">
                Annonce Top ·{' '}
                <span className="tabular-nums">{formatFcfa(config.topListingPrice)}</span>
              </h3>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Met en tête une annonce déjà approuvée pendant{' '}
                {config.topListingDurationDays || 7} jours.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToPublish}
              className="text-left text-sm font-bold text-[#0B1437] dark:text-indigo-300 hover:underline cursor-pointer"
            >
              Soumettre une annonce →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
