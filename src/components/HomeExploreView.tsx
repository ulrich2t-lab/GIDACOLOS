import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Coins,
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
import { BrandLogo } from './BrandLogo';
import { ListingCard } from './ListingCard';
import type {
  BathroomType,
  ColocProfile,
  Listing,
  PlatformConfig,
  PropertyType,
} from '../types/platform';

const PAGE_BATCH_SIZE = 12;

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
  const [maxPrice, setMaxPrice] = useState<'all' | '15000' | '25000' | '40000' | '75000'>('all');
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
    maxPrice,
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

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      selectedNeighborhood !== 'all' ||
      selectedType !== 'all' ||
      selectedBathroom !== 'all' ||
      maxPrice !== 'all' ||
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
      if (maxPrice !== 'all' && item.priceFcfa > Number(maxPrice)) return false;
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
    maxPrice,
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
    setMaxPrice('all');
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

  return (
    <div className="space-y-14">
      {/* Hero + Search Bar */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between gap-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-3">
                GidaColocs · Maradi, Niger · Logements vérifiés &amp; Colocation
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-[#0A2540] dark:text-white leading-[1.12] text-balance">
                Trouvez votre chambre, annexe ou maison à partager sur GidaColocs.
              </h1>
              <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Consultez les logements contrôlés à Maradi sans compte obligatoire : chambres avec
                douche interne ou externe, studios, appartements, annexes et colocations fiables.
              </p>
            </div>

            {/* Search & Quick Filter Bar */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Chambre douche interne, annexe, UDM..."
                  aria-label="Rechercher un logement"
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="sm:col-span-4">
                <select
                  value={selectedNeighborhood}
                  onChange={(e) => setSelectedNeighborhood(e.target.value)}
                  aria-label="Sélectionner un quartier"
                  className="w-full min-h-[44px] px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="all">Tous les quartiers</option>
                  {MARADI_NEIGHBORHOODS.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <select
                  value={maxPrice}
                  onChange={(e) =>
                    setMaxPrice(e.target.value as 'all' | '15000' | '25000' | '40000' | '75000')
                  }
                  aria-label="Budget maximum"
                  className="w-full min-h-[44px] px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="all">Tout budget</option>
                  <option value="15000">≤ 15 000 FCFA</option>
                  <option value="25000">≤ 25 000 FCFA</option>
                  <option value="40000">≤ 40 000 FCFA</option>
                  <option value="75000">≤ 75 000 FCFA</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Brand & Trust Column */}
          <div className="lg:col-span-5 bg-[#0A2540] text-white p-8 sm:p-10 flex flex-col justify-between gap-8">
            <div className="flex items-center justify-between gap-4">
              <BrandLogo
                inverted
                size="lg"
                subtitle="Logement & Colocation Vérifiés"
              />
              <div className="text-right shrink-0">
                <p className="text-xl font-extrabold text-teal-300 tabular-nums">
                  {activeAvailableCount}
                </p>
                <p className="text-[11px] text-slate-300">disponibles</p>
              </div>
            </div>

            <div className="space-y-4 text-sm text-slate-200">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Contrôle anti-arnaques GidaColocs</p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Chaque annonce est vérifiée manuellement avant publication. Coordonnées privées
                    protégées.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Espace Rencontre Colocataires</p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Rencontrez étudiants et jeunes actifs pour partager une maison ou une annexe.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">
                    Dépôt gratuit · Pass Visite à {formatFcfa(config.visitPassPrice)}
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Mobile Money local (Airtel, MTN, Moov, NITA) avec reçu officiel GidaColocs.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/15 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onGoToPublish}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-[#0A2540] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Publier gratuitement</span>
              </button>
              <button
                type="button"
                onClick={onGoToColocation}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-white/25 hover:bg-white/10 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Users className="w-4 h-4 text-teal-300" />
                <span>Trouver un colocataire</span>
              </button>
              <a
                href={communityGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors whitespace-nowrap"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>Rejoindre le groupe WhatsApp</span>
              </a>
              <a
                href={whatsappSupportUrlPrimary}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-white/25 hover:bg-white/10 text-white rounded-lg transition-colors whitespace-nowrap tabular-nums"
              >
                <MessageCircle className="w-4 h-4 text-teal-300" />
                <span>Assistance WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Goal-Driven Navigation Shortcuts */}
      <section aria-label="Parcours rapides" className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Que souhaitez-vous faire aujourd’hui ?
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Accédez directement au service adapté à votre besoin à Maradi
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedType('chambre');
              setAvailabilityFilter('published');
              scrollToSection('logements');
            }}
            className="min-h-[84px] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-600 text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
              Je cherche une chambre
            </span>
          </button>

          <button
            type="button"
            onClick={onGoToPublish}
            className="min-h-[84px] p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 hover:border-emerald-500 text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
              Je veux publier un logement
            </span>
          </button>

          <button
            type="button"
            onClick={onGoToColocation}
            className="min-h-[84px] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-600 text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer"
          >
            <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
              Je cherche un colocataire
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAvailabilityFilter('published');
              scrollToSection('logements');
            }}
            className="min-h-[84px] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-600 text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer"
          >
            <CalendarCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
              Organiser une visite
            </span>
          </button>

          <button
            type="button"
            onClick={() => (user ? onGoToAccount() : openAuthModal())}
            className="min-h-[84px] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-600 text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer"
          >
            <Building2 className="w-4 h-4 text-[#0A2540] dark:text-sky-400" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
              Gérer mes annonces
            </span>
          </button>

          <button
            type="button"
            onClick={() => (user ? onGoToAccount() : openAuthModal())}
            className="min-h-[84px] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-600 text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer"
          >
            <Coins className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
              Consulter mes paiements
            </span>
          </button>
        </div>
      </section>

      {/* Quartiers Stratégiques de Maradi */}
      <section id="quartiers" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Quartiers couverts à Maradi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cliquez sur un quartier pour filtrer les offres disponibles
            </p>
          </div>
          {selectedNeighborhood !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedNeighborhood('all')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline self-start sm:self-auto cursor-pointer"
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
                onClick={() => setSelectedNeighborhood(active ? 'all' : q)}
                className={`min-h-[72px] p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {q}
                  </span>
                  <MapPin
                    className={`w-3.5 h-3.5 shrink-0 ${
                      active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'
                    }`}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {neighborhoodCounts[q] || 0} disponible{(neighborhoodCounts[q] || 0) > 1 ? 's' : ''}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured TOP Listings & Recently Approved Highlights (shown when unfiltered) */}
      {!loading && !hasActiveFilters && featuredTopListings.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-current shrink-0" />
                <span>Annonces mises en avant</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
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
              <h2 className="text-xl font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>Récemment approuvées</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Derniers logements contrôlés et validés par GidaColocs
              </p>
            </div>
            <button
              type="button"
              onClick={() => scrollToSection('logements')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>Tout voir</span>
              <ArrowRight className="w-3.5 h-3.5" />
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
      <section id="logements" className="space-y-6">
        <div className="flex flex-col gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Catalogue des logements à Maradi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {filteredListings.length} logement{filteredListings.length > 1 ? 's' : ''} trouvé
                {filteredListings.length > 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedBathroom}
                onChange={(e) => setSelectedBathroom(e.target.value as 'all' | BathroomType)}
                aria-label="Filtrer par type de douche"
                className="min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="all">Douche : Toutes</option>
                <option value="interne">Douche interne</option>
                <option value="externe">Douche externe</option>
                <option value="partagee">Douche partagée</option>
              </select>

              <div className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value={availabilityFilter}
                  onChange={(e) =>
                    setAvailabilityFilter(e.target.value as 'active' | 'published' | 'all')
                  }
                  aria-label="Filtrer par disponibilité"
                  className="min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <option value="active">Disponibles &amp; Réservés</option>
                  <option value="published">Disponibles uniquement</option>
                  <option value="all">Inclure les pris / loués</option>
                </select>
              </div>
            </div>
          </div>

          {/* Property Type Categories */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedType('all')}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                selectedType === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Tous les biens
            </button>
            {PROPERTY_TYPES.map((pt) => (
              <button
                key={pt.value}
                type="button"
                onClick={() => setSelectedType(pt.value)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedType === pt.value
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
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
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
              >
                <div className="aspect-[4/3] bg-slate-200 dark:bg-slate-800" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Aucun logement ne correspond à ces critères
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {listings.length === 0
                ? 'La base publique ne contient pas encore d’annonces publiées. Vous pouvez soumettre un logement ou initialiser des biens de référence.'
                : 'Essayez d’élargir votre budget ou de réinitialiser le filtre de catégorie ou de douche.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {listings.length > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Réinitialiser les filtres
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onGoToPublish}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Publier le premier logement</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={seeding}
                      onClick={handleSeedStarters}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg cursor-pointer"
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
              <p className="text-xs text-red-600 dark:text-red-400">{seedError}</p>
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
                  className="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-[#0A2540] dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-teal-600 rounded-xl shadow-xs transition-colors cursor-pointer tabular-nums"
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

      {/* Roommate Finder & Community Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                Colocation GidaColocs
              </p>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                Trouver un colocataire à Maradi
              </h2>
            </div>
            <button
              type="button"
              onClick={onGoToColocation}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg transition-colors cursor-pointer shrink-0 self-start"
            >
              <Users className="w-4 h-4" />
              <span>Voir l’espace colocation</span>
            </button>
          </div>

          {colocProfiles.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {colocProfiles.slice(0, 2).map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {p.authorName}
                      </p>
                      <p className="text-[11px] text-teal-700 dark:text-teal-400 font-medium truncate">
                        {p.occupation} · {COLOC_GENDER_LABELS[p.genderPreference]}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[#0A2540] dark:text-white tabular-nums shrink-0">
                      ≤ {formatFcfa(p.maxBudgetFcfa)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {p.bio}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {p.targetNeighborhood} · {formatTimestamp(p.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Publiez gratuitement votre profil de recherche ou consultez les étudiants de l’UDM et
              jeunes actifs cherchant à partager une maison ou une annexe.
            </p>
          )}
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Communauté &amp; Entraide
            </p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Groupe officiel WhatsApp GidaColocs
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Adhérez directement au groupe WhatsApp GidaColocs pour recevoir les alertes de
              nouveaux logements vérifiés, échanger avec des colocataires et obtenir de l’aide à Maradi.
            </p>
          </div>

          <div className="space-y-2.5">
            <a
              href={communityGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>REJOINDRE LE GROUPE WHATSAPP GIDACOLOCS</span>
            </a>

            <a
              href={whatsappSupportUrlPrimary}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors tabular-nums"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Contacter l’assistance GidaColocs</span>
            </a>

            {whatsappSecondary && whatsappSecondary !== config.whatsappNumber && (
              <a
                href={whatsappSupportUrlSecondary}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 rounded-lg transition-colors tabular-nums"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span>WhatsApp Niger ({whatsappSecondary})</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Platform Advantages + Transparent Tariffs + Free Publishing CTA */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Pourquoi choisir GidaColocs à Maradi ?
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Une plateforme claire, vérifiée et accessible sur téléphone comme sur ordinateur.
            </p>
          </div>

          <button
            type="button"
            onClick={onGoToPublish}
            className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer self-start shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Déposer une annonce gratuitement (0 FCFA)</span>
          </button>
        </div>

        {/* 3 Key Advantages */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Validation manuelle obligatoire
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Aucune annonce n’apparaît sans contrôle des photos, du prix et de l’identité du
                déposant par l’administrateur.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-[#0A2540] dark:text-teal-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Protection des données privées
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Les numéros personnels des bailleurs restent privés et ne sont débloqués qu’après
                autorisation ou Pass Visite validé.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Connexion WhatsApp simple
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Créez votre accès avec votre numéro WhatsApp et un code simple, ou en 1 clic via
                Google, sans dépendre des SMS.
              </p>
            </div>
          </div>
        </div>

        {/* Transparent Tariffs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 flex flex-col justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                Pour tous les bailleurs &amp; démarcheurs
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                Publication d’annonce ·{' '}
                <span className="text-emerald-700 dark:text-emerald-400">Gratuite (0 FCFA)</span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Déposez chambres, studios, appartements, maisons, annexes et autres logements
                gratuitement. Chaque annonce est vérifiée avant mise en ligne.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToPublish}
              className="text-left text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:underline cursor-pointer"
            >
              Publier gratuitement →
            </button>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                Pour les étudiants &amp; locataires
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                Pass visite · <span className="tabular-nums">{formatFcfa(config.visitPassPrice)}</span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Débloque le numéro direct vérifié du bailleur et l’accompagnement visite sur le
                terrain après validation du paiement.
              </p>
            </div>
            <a
              href="#logements"
              className="text-xs font-semibold text-[#0A2540] dark:text-teal-400 hover:underline"
            >
              Choisir un logement →
            </a>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                Option facultative (annonces approuvées)
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                Annonce Top · <span className="tabular-nums">{formatFcfa(config.topListingPrice)}</span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Service facultatif permettant de mettre en tête une annonce déjà approuvée pendant{' '}
                {config.topListingDurationDays || 7} jours.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToPublish}
              className="text-left text-xs font-semibold text-[#0A2540] dark:text-teal-400 hover:underline cursor-pointer"
            >
              Soumettre une annonce →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
