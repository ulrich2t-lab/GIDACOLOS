import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Ban,
  Bell,
  BookmarkCheck,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  Film,
  History,
  Image as ImageIcon,
  KeyRound,
  Link2,
  LogOut,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  UserCheck,
  Users,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  MARADI_NEIGHBORHOODS,
  OFFICIAL_WHATSAPP_GROUP_URL,
  REPORT_REASONS,
} from '../lib/constants';
import {
  ACCOUNT_STATUS_LABELS,
  ACCOUNT_TYPE_LABELS,
  BATHROOM_LABELS,
  buildWhatsAppUrl,
  COLOC_DESIRED_LABELS,
  COLOC_GENDER_LABELS,
  COLOC_STATUS_CATEGORY_LABELS,
  CONTENT_MODERATION_LABELS,
  DEPOSITOR_STATUS_LABELS,
  downloadPaymentReceipt,
  formatFcfa,
  formatTimestamp,
  FURNISHED_LABELS,
  LISTING_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  REPORT_STATUS_LABELS,
  ROOMMATE_PREFERENCE_LABELS,
  TOILET_LABELS,
  UTILITY_LABELS,
} from '../lib/formatters';
import { formatFirestoreErrorMessage } from '../lib/firestoreError';
import { parseVideoEmbed } from '../lib/mediaUtils';
import {
  adminFetchUserPrivateInfo,
  adminInitializeStarterListings,
  adminModerateColocInterest,
  adminModerateColocMessage,
  adminModerateColocProfile,
  adminModerateListing,
  adminModerateListingReview,
  adminRejectServiceOrder,
  adminRemoveAllRentedListings,
  adminSetUserAccountStatus,
  adminUpdateColocReportStatus,
  adminUpdateListingStatusAndBadges,
  adminUpdateReportStatus,
  adminUpdateUserAccountType,
  adminVerifyServiceOrder,
  confirmRentalForTenant,
  deleteColocProfile,
  deleteListingById,
  fetchListingPrivateContact,
  fetchListingPrivateVerification,
  fetchListingVideoClip,
  markAdminAlertRead,
  markAllAdminAlertsRead,
  savePlatformConfig,
  updateColocProfileStatus,
  updateListingAvailabilityStatus,
} from '../lib/qolockService';
import { useAuth } from '../context/AuthContext';
import type {
  AccountStatus,
  AccountType,
  ActivityTargetType,
  AdminAlert,
  AdminAlertType,
  ColocInterest,
  ColocMessage,
  ColocProfile,
  ColocProfileStatus,
  ColocReportItem,
  ContentModerationEntry,
  ContentModerationStatus,
  Listing,
  ListingPrivateVerification,
  ListingReview,
  OrderStatus,
  OrderType,
  PlatformActivity,
  PlatformConfig,
  RentalConfirmation,
  ReportItem,
  ReportStatus,
  ServiceOrder,
  UserPrivateInfo,
  UserProfile,
} from '../types/platform';

interface AdminDashboardViewProps {
  config: PlatformConfig;
  allListings: Listing[];
  allOrders: ServiceOrder[];
  allReports: ReportItem[];
  allColocProfiles?: ColocProfile[];
  allColocInterests?: ColocInterest[];
  allColocMessages?: ColocMessage[];
  allListingReviews?: ListingReview[];
  allColocReports?: ColocReportItem[];
  allUsers: UserProfile[];
  activities: PlatformActivity[];
  adminAlerts?: AdminAlert[];
  allRentalConfirmations?: RentalConfirmation[];
  onGoToPublish: () => void;
  onEditListing: (listing: Listing) => void;
  onSignOut?: () => void | Promise<void>;
}

type AdminTab =
  | 'pending_queue'
  | 'listings'
  | 'availability'
  | 'orders'
  | 'coloc'
  | 'reports'
  | 'users'
  | 'history'
  | 'settings';

interface NeighborhoodChartPoint {
  neighborhood: string;
  shortName: string;
  published: number;
  reserved: number;
  pending: number;
  rented: number;
  total: number;
  avgPrice: number;
}

interface UserGrowthChartPoint {
  dateKey: string;
  dateLabel: string;
  nouveaux: number;
  cumul: number;
  tenants: number;
  landlords: number;
}

const REPORT_REASON_LABELS = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label]),
) as Record<string, string>;

const ACTIVITY_TYPE_LABELS: Record<'all' | ActivityTargetType, string> = {
  all: 'Toutes',
  listing: 'Annonces',
  order: 'Paiements',
  report: 'Réclamations',
  coloc: 'Colocation',
  community: 'Communauté',
  config: 'Configuration',
  user: 'Utilisateurs',
  rental: 'Locations',
  review: 'Avis & Commentaires',
};

type ModerationCategoryFilter =
  | 'all'
  | 'listings'
  | 'coloc_profiles'
  | 'coloc_interests'
  | 'comments_reviews';

type ContentModerationTarget =
  | { kind: 'coloc_profile'; item: ColocProfile; decision: 'rejected' | 'needs_correction' }
  | { kind: 'coloc_interest'; item: ColocInterest; decision: 'rejected' | 'needs_correction' }
  | { kind: 'coloc_message'; item: ColocMessage; decision: 'rejected' | 'needs_correction' }
  | { kind: 'review'; item: ListingReview; decision: 'rejected' | 'needs_correction' };

const ADMIN_ALERT_PREFIX: Record<AdminAlertType, string> = {
  new_listing: 'Nouvelle annonce gratuite : ',
  resubmitted_listing: 'Annonce modifiée & resoumise : ',
  rental_confirmed: 'Location confirmée : ',
  new_coloc_profile: 'Nouveau profil colocataire : ',
  resubmitted_coloc_profile: 'Profil colocataire modifié : ',
  new_coloc_request: 'Nouvelle demande de colocation : ',
  new_comment: 'Nouveau commentaire colocation : ',
  new_review: 'Nouvel avis public : ',
};

function normalizeContentModStatus(status?: ContentModerationStatus): ContentModerationStatus {
  return status || 'pending';
}

function listingMatchesModerationStatus(
  listing: Listing,
  statusFilter: ContentModerationStatus,
): boolean {
  if (statusFilter === 'pending') {
    return listing.status === 'pending' || listing.status === 'in_review';
  }
  if (statusFilter === 'approved') {
    return (
      listing.status === 'published' ||
      listing.status === 'reserved' ||
      listing.status === 'rented'
    );
  }
  if (statusFilter === 'rejected') {
    return listing.status === 'rejected' || listing.status === 'suspended';
  }
  return listing.status === 'needs_correction';
}

function shortNeighborhoodLabel(name: string): string {
  if (name === 'Maradi Centre') return 'Centre';
  if (name === 'Ali Dan Sofo') return 'Ali D. Sofo';
  if (name === 'Dan Goulbi') return 'D. Goulbi';
  return name;
}

export function AdminDashboardView({
  config,
  allListings,
  allOrders,
  allReports,
  allColocProfiles = [],
  allColocInterests = [],
  allColocMessages = [],
  allListingReviews = [],
  allColocReports = [],
  allUsers,
  activities,
  adminAlerts = [],
  allRentalConfirmations = [],
  onGoToPublish,
  onEditListing,
  onSignOut,
}: AdminDashboardViewProps) {
  const { user, profile, isAdmin, signOutUser, theme } = useAuth();
  const [tab, setTab] = useState<AdminTab>('pending_queue');
  const [moderationCategoryFilter, setModerationCategoryFilter] =
    useState<ModerationCategoryFilter>('all');
  const [moderationStatusFilter, setModerationStatusFilter] =
    useState<ContentModerationStatus>('pending');
  const [contentModerationTarget, setContentModerationTarget] =
    useState<ContentModerationTarget | null>(null);
  const [contentModerationReason, setContentModerationReason] = useState('');

  // Filters
  const [listingSearch, setListingSearch] = useState('');
  const [listingStatusFilter, setListingStatusFilter] = useState<
    | 'all'
    | 'pending'
    | 'in_review'
    | 'needs_correction'
    | 'top_requested'
    | 'approved'
    | 'published'
    | 'reserved'
    | 'rented'
    | 'rejected'
    | 'suspended'
  >('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<
    'all' | 'reserved' | 'rented' | 'published'
  >('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | OrderType>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | ReportStatus>('all');
  const [colocStatusFilter, setColocStatusFilter] = useState<'all' | ColocProfileStatus>('all');
  const [colocSearch, setColocSearch] = useState('');
  const [confirmDeleteColocId, setConfirmDeleteColocId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | AccountType>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | AccountStatus>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | ActivityTargetType>('all');
  const [historySearch, setHistorySearch] = useState('');

  // Action & contact lookup states
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkPurge, setConfirmBulkPurge] = useState(false);
  const [purgingRented, setPurgingRented] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [userContacts, setUserContacts] = useState<Record<string, UserPrivateInfo | null>>({});
  const [loadingContactUid, setLoadingContactUid] = useState<string | null>(null);

  // Settings form state
  const [visitPassPrice, setVisitPassPrice] = useState(String(config.visitPassPrice));
  const [topListingPrice, setTopListingPrice] = useState(String(config.topListingPrice));
  const [topListingDurationDays, setTopListingDurationDays] = useState(
    String(config.topListingDurationDays || 7),
  );
  const [whatsappNumber, setWhatsappNumber] = useState(config.whatsappNumber);
  const [whatsappSecondaryNumber, setWhatsappSecondaryNumber] = useState(
    config.whatsappSecondaryNumber || '+22776688125',
  );
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState(
    config.whatsappGroupUrl || OFFICIAL_WHATSAPP_GROUP_URL,
  );
  const [mtnNumber, setMtnNumber] = useState(config.mtnNumber || '+2290157382961');
  const [moovNumber, setMoovNumber] = useState(config.moovNumber);
  const [airtelNumber, setAirtelNumber] = useState(config.airtelNumber);
  const [nitaAccount, setNitaAccount] = useState(config.nitaAccount);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // Payment proof & decision modal state
  const [orderActionTarget, setOrderActionTarget] = useState<{
    order: ServiceOrder;
    nextStatus: 'rejected' | 'failed' | 'refunded';
  } | null>(null);
  const [orderActionReason, setOrderActionReason] = useState('');
  const [previewProofOrder, setPreviewProofOrder] = useState<ServiceOrder | null>(null);

  // Listing inspection, lightbox, private dossier & moderation modal state
  const [inspectListing, setInspectListing] = useState<Listing | null>(null);
  const [inspectVerification, setInspectVerification] = useState<ListingPrivateVerification | null>(
    null,
  );
  const [loadingVerification, setLoadingVerification] = useState(false);
  const [inspectLightboxIdx, setInspectLightboxIdx] = useState<number | null>(null);
  const [inspectVideoCache, setInspectVideoCache] = useState<Record<string, string>>({});
  const [loadingInspectVideoId, setLoadingInspectVideoId] = useState<string | null>(null);
  const [listingModerationTarget, setListingModerationTarget] = useState<{
    listing: Listing;
    nextStatus: 'needs_correction' | 'rejected' | 'suspended';
  } | null>(null);
  const [listingModerationReason, setListingModerationReason] = useState('');

  // Confirm rental modal state
  const [confirmRentalTarget, setConfirmRentalTarget] = useState<Listing | null>(null);
  const [rentalTenantId, setRentalTenantId] = useState('');
  const [rentalTenantSearch, setRentalTenantSearch] = useState('');
  const [rentalTenantPhone, setRentalTenantPhone] = useState('');
  const [rentalWelcomeMessage, setRentalWelcomeMessage] = useState('');
  const [confirmedRentalResult, setConfirmedRentalResult] = useState<{
    listingTitle: string;
    neighborhood: string;
    tenantName: string;
    welcomeMessage: string;
    whatsappGroupUrl: string;
  } | null>(null);

  // User suspension modal state
  const [userSuspendTarget, setUserSuspendTarget] = useState<UserProfile | null>(null);
  const [userSuspendReason, setUserSuspendReason] = useState('');

  useEffect(() => {
    setVisitPassPrice(String(config.visitPassPrice));
    setTopListingPrice(String(config.topListingPrice));
    setTopListingDurationDays(String(config.topListingDurationDays || 7));
    setWhatsappNumber(config.whatsappNumber);
    setWhatsappSecondaryNumber(config.whatsappSecondaryNumber || '+22776688125');
    setWhatsappGroupUrl(config.whatsappGroupUrl || OFFICIAL_WHATSAPP_GROUP_URL);
    setMtnNumber(config.mtnNumber || '+2290157382961');
    setMoovNumber(config.moovNumber);
    setAirtelNumber(config.airtelNumber);
    setNitaAccount(config.nitaAccount);
  }, [config]);

  useEffect(() => {
    if (!inspectListing) {
      setInspectVerification(null);
      setLoadingVerification(false);
      setInspectLightboxIdx(null);
      return;
    }
    let cancelled = false;
    setLoadingVerification(true);
    setInspectVerification(null);
    setInspectLightboxIdx(null);
    Promise.all([
      fetchListingPrivateVerification(inspectListing.id).catch(() => null),
      fetchListingPrivateContact(inspectListing.id).catch(() => null),
    ])
      .then(([verification, contact]) => {
        if (cancelled) return;
        if (verification) {
          setInspectVerification(verification);
        } else if (contact) {
          setInspectVerification({
            ownerId: contact.ownerId,
            contactName: contact.contactName,
            contactPhone: contact.contactPhone,
            contactWhatsapp: contact.contactPhone,
            depositorAddress: inspectListing.neighborhood,
            depositorStatus: 'proprietaire',
            authorizationNote: 'Coordonnées issues du dossier contact initial.',
          });
        } else {
          setInspectVerification(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVerification(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inspectListing?.id]);

  useEffect(() => {
    if (!inspectListing) return;
    const fresh = allListings.find((item) => item.id === inspectListing.id);
    if (fresh && fresh !== inspectListing) {
      setInspectListing(fresh);
    }
  }, [allListings, inspectListing]);

  useEffect(() => {
    if (inspectLightboxIdx === null || !inspectListing || inspectListing.photos.length === 0) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectLightboxIdx(null);
      } else if (e.key === 'ArrowRight') {
        setInspectLightboxIdx((prev) =>
          prev === null ? null : (prev + 1) % inspectListing.photos.length,
        );
      } else if (e.key === 'ArrowLeft') {
        setInspectLightboxIdx((prev) =>
          prev === null
            ? null
            : (prev - 1 + inspectListing.photos.length) % inspectListing.photos.length,
        );
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [inspectLightboxIdx, inspectListing]);

  const neighborhoodChartData = useMemo<NeighborhoodChartPoint[]>(() => {
    const map = new Map<
      string,
      {
        published: number;
        reserved: number;
        pending: number;
        rented: number;
        total: number;
        priceSum: number;
      }
    >();
    for (const q of MARADI_NEIGHBORHOODS) {
      map.set(q, { published: 0, reserved: 0, pending: 0, rented: 0, total: 0, priceSum: 0 });
    }
    for (const item of allListings) {
      const key = item.neighborhood || 'Autre';
      const entry = map.get(key) ?? {
        published: 0,
        reserved: 0,
        pending: 0,
        rented: 0,
        total: 0,
        priceSum: 0,
      };
      if (item.status === 'published') entry.published += 1;
      else if (item.status === 'reserved') entry.reserved += 1;
      else if (
        item.status === 'pending' ||
        item.status === 'in_review' ||
        item.status === 'needs_correction'
      ) {
        entry.pending += 1;
      } else if (item.status === 'rented') entry.rented += 1;
      if (item.status !== 'rejected' && item.status !== 'suspended') {
        entry.total += 1;
        entry.priceSum += item.priceFcfa || 0;
      }
      map.set(key, entry);
    }

    return Array.from(map.entries()).map(([neighborhood, stats]) => ({
      neighborhood,
      shortName: shortNeighborhoodLabel(neighborhood),
      published: stats.published,
      reserved: stats.reserved,
      pending: stats.pending,
      rented: stats.rented,
      total: stats.total,
      avgPrice: stats.total > 0 ? Math.round(stats.priceSum / stats.total) : 0,
    }));
  }, [allListings]);

  const userGrowthChartData = useMemo<UserGrowthChartPoint[]>(() => {
    if (allUsers.length === 0) return [];

    const byDay = new Map<string, { ts: number; count: number; tenants: number; landlords: number }>();
    for (const u of allUsers) {
      const date =
        u.createdAt && typeof u.createdAt.toDate === 'function'
          ? u.createdAt.toDate()
          : new Date();
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${d}`;
      const existing = byDay.get(dateKey) ?? {
        ts: new Date(y, date.getMonth(), date.getDate()).getTime(),
        count: 0,
        tenants: 0,
        landlords: 0,
      };
      existing.count += 1;
      if (u.accountType === 'landlord') existing.landlords += 1;
      else existing.tenants += 1;
      byDay.set(dateKey, existing);
    }

    const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[1].ts - b[1].ts);
    const formatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });

    const series: UserGrowthChartPoint[] = [];
    if (sortedDays.length === 1) {
      const firstDayTs = sortedDays[0][1].ts - 86400000;
      series.push({
        dateKey: 'baseline',
        dateLabel: formatter.format(new Date(firstDayTs)),
        nouveaux: 0,
        cumul: 0,
        tenants: 0,
        landlords: 0,
      });
    }

    let runningTotal = 0;
    for (const [dateKey, info] of sortedDays) {
      runningTotal += info.count;
      series.push({
        dateKey,
        dateLabel: formatter.format(new Date(info.ts)),
        nouveaux: info.count,
        cumul: runningTotal,
        tenants: info.tenants,
        landlords: info.landlords,
      });
    }
    return series;
  }, [allUsers]);

  const commissionStats = useMemo(() => {
    let visitPassRevenue = 0;
    let visitPassCount = 0;
    let topListingRevenue = 0;
    let topListingCount = 0;
    let contractRevenue = 0;
    let contractCount = 0;
    let pendingRevenue = 0;
    let rejectedRevenue = 0;
    const byChannel = new Map<string, { count: number; total: number }>();

    for (const ord of allOrders) {
      if (ord.status === 'verified') {
        if (ord.orderType === 'visit_pass') {
          visitPassRevenue += ord.amountFcfa;
          visitPassCount += 1;
        } else if (ord.orderType === 'top_listing') {
          topListingRevenue += ord.amountFcfa;
          topListingCount += 1;
        } else if (ord.orderType === 'contract') {
          contractRevenue += ord.amountFcfa;
          contractCount += 1;
        }
        const cur = byChannel.get(ord.paymentMethod) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += ord.amountFcfa;
        byChannel.set(ord.paymentMethod, cur);
      } else if (ord.status === 'pending') {
        pendingRevenue += ord.amountFcfa;
      } else if (ord.status === 'rejected' || ord.status === 'failed') {
        rejectedRevenue += ord.amountFcfa;
      }
    }

    const verifiedTotal = visitPassRevenue + topListingRevenue + contractRevenue;
    return {
      visitPassRevenue,
      visitPassCount,
      topListingRevenue,
      topListingCount,
      contractRevenue,
      contractCount,
      pendingRevenue,
      rejectedRevenue,
      verifiedTotal,
      generatedTotal: verifiedTotal + pendingRevenue,
      channels: Array.from(byChannel.entries()).sort((a, b) => b[1].total - a[1].total),
    };
  }, [allOrders]);

  const userActivityCounts = useMemo(() => {
    const listingsByOwner = new Map<string, number>();
    const ordersByUser = new Map<string, number>();
    for (const l of allListings) {
      listingsByOwner.set(l.ownerId, (listingsByOwner.get(l.ownerId) || 0) + 1);
    }
    for (const o of allOrders) {
      ordersByUser.set(o.userId, (ordersByUser.get(o.userId) || 0) + 1);
    }
    return { listingsByOwner, ordersByUser };
  }, [allListings, allOrders]);

  if (!user || !isAdmin) return null;
  const adminName = profile?.displayName || user.displayName || 'Administrateur';
  const officialCommunityUrl = config.whatsappGroupUrl || OFFICIAL_WHATSAPP_GROUP_URL;

  const pendingOnlyListingsCount = allListings.filter((l) => l.status === 'pending').length;
  const inReviewListingsCount = allListings.filter((l) => l.status === 'in_review').length;
  const needsCorrectionListingsCount = allListings.filter(
    (l) => l.status === 'needs_correction',
  ).length;
  const pendingListingsCount =
    pendingOnlyListingsCount + inReviewListingsCount + needsCorrectionListingsCount;
  const pendingColocProfilesCount = allColocProfiles.filter(
    (p) => normalizeContentModStatus(p.moderationStatus) === 'pending',
  ).length;
  const pendingColocInterestsCount = allColocInterests.filter(
    (i) => normalizeContentModStatus(i.moderationStatus) === 'pending',
  ).length;
  const pendingCommentsReviewsCount =
    allColocMessages.filter((m) => normalizeContentModStatus(m.moderationStatus) === 'pending')
      .length +
    allListingReviews.filter((r) => normalizeContentModStatus(r.moderationStatus) === 'pending')
      .length;
  const totalPendingModerationCount =
    pendingListingsCount +
    pendingColocProfilesCount +
    pendingColocInterestsCount +
    pendingCommentsReviewsCount;
  const unreadAdminAlerts = adminAlerts.filter((a) => !a.read);
  const unreadAdminAlertsCount = unreadAdminAlerts.length;
  const topRequestedCount = allListings.filter((l) => l.topRequested && !l.isTop).length;
  const topActiveCount = allListings.filter((l) => l.isTop).length;
  const publishedListingsCount = allListings.filter((l) => l.status === 'published').length;
  const reservedListingsCount = allListings.filter((l) => l.status === 'reserved').length;
  const rentedListings = allListings.filter((l) => l.status === 'rented');
  const rentedListingsCount = rentedListings.length;
  const approvedListingsCount = publishedListingsCount + reservedListingsCount + rentedListingsCount;
  const rejectedListingsCount = allListings.filter((l) => l.status === 'rejected').length;
  const suspendedListingsCount = allListings.filter((l) => l.status === 'suspended').length;
  const pendingOrdersCount = allOrders.filter((o) => o.status === 'pending').length;
  const verifiedOrdersCount = allOrders.filter((o) => o.status === 'verified').length;
  const rejectedOrdersCount = allOrders.filter(
    (o) => o.status === 'rejected' || o.status === 'failed',
  ).length;
  const visitReservations = allOrders.filter((o) => o.orderType === 'visit_pass');
  const activeColocProfilesCount = allColocProfiles.filter((c) => c.status === 'active').length;
  const foundColocProfilesCount = allColocProfiles.filter((c) => c.status === 'found').length;
  const openListingReportsCount = allReports.filter((r) => r.status === 'open').length;
  const openColocReportsCount = allColocReports.filter((r) => r.status === 'open').length;
  const openReportsCount = openListingReportsCount + openColocReportsCount;
  const totalNotifications =
    totalPendingModerationCount +
    unreadAdminAlertsCount +
    topRequestedCount +
    pendingOrdersCount +
    openReportsCount;

  const landlordUsersCount = allUsers.filter((u) => u.accountType === 'landlord').length;
  const tenantUsersCount = allUsers.length - landlordUsersCount;
  const suspendedUsersCount = allUsers.filter((u) => u.accountStatus === 'suspended').length;
  const activeUsersCount = allUsers.length - suspendedUsersCount;
  const recentUsersCount = allUsers.filter((u) => {
    if (!u.createdAt || typeof u.createdAt.toMillis !== 'function') return false;
    return Date.now() - u.createdAt.toMillis() <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  const isDark = theme === 'dark';
  const axisTickColor = isDark ? '#94A3B8' : '#64748B';
  const gridStrokeColor = isDark ? '#1E293B' : '#E2E8F0';
  const rentedBarColor = isDark ? '#38BDF8' : '#0A2540';

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigMessage(null);
    setConfigError(null);
    const trimmedGroupUrl = whatsappGroupUrl.trim();
    if (trimmedGroupUrl && !/^https:\/\//i.test(trimmedGroupUrl)) {
      setConfigError('Le lien du groupe WhatsApp doit commencer par https://.');
      return;
    }
    setSavingConfig(true);
    try {
      await savePlatformConfig(
        {
          visitPassPrice: Number(visitPassPrice),
          topListingPrice: Number(topListingPrice),
          topListingDurationDays: Math.max(1, Math.min(90, Number(topListingDurationDays) || 7)),
          whatsappNumber,
          whatsappSecondaryNumber,
          whatsappGroupUrl: trimmedGroupUrl,
          mtnNumber,
          moovNumber,
          airtelNumber,
          nitaAccount,
        },
        user,
        adminName,
      );
      setConfigMessage('Tarifs, lien WhatsApp et numéros mis à jour.');
    } catch (err) {
      setConfigError(
        formatFirestoreErrorMessage(err, 'Erreur lors de la sauvegarde de la configuration.'),
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSeedStarters = async () => {
    setSeeding(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      await adminInitializeStarterListings(user, adminName);
      setAdminSuccess('4 logements de référence publiés.');
    } catch (err) {
      setAdminError(formatFirestoreErrorMessage(err, 'Impossible d’initialiser les logements.'));
    } finally {
      setSeeding(false);
    }
  };

  const handleBulkPurgeRented = async () => {
    if (rentedListings.length === 0) return;
    setPurgingRented(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      const removed = await adminRemoveAllRentedListings(rentedListings, user, adminName);
      setConfirmBulkPurge(false);
      setAdminSuccess(`${removed} logement(s) pris enlevé(s) définitivement.`);
    } catch (err) {
      setAdminError(
        formatFirestoreErrorMessage(err, 'Erreur lors du nettoyage des logements pris.'),
      );
    } finally {
      setPurgingRented(false);
    }
  };

  const runAdminAction = async (
    actionKey: string,
    fn: () => Promise<void>,
    successText: string,
  ) => {
    setBusyActionId(actionKey);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      await fn();
      setAdminSuccess(successText);
    } catch (err) {
      setAdminError(formatFirestoreErrorMessage(err, 'Impossible d’effectuer cette action.'));
    } finally {
      setBusyActionId(null);
    }
  };

  const handleLoadUserContact = async (targetUid: string) => {
    if (loadingContactUid === targetUid) return;
    setLoadingContactUid(targetUid);
    setAdminError(null);
    try {
      const info = await adminFetchUserPrivateInfo(targetUid);
      setUserContacts((prev) => ({ ...prev, [targetUid]: info }));
    } catch (err) {
      setAdminError(
        formatFirestoreErrorMessage(err, 'Impossible de lire les coordonnées de cet utilisateur.'),
      );
    } finally {
      setLoadingContactUid(null);
    }
  };

  const openConfirmRentalModal = (listing: Listing) => {
    setConfirmRentalTarget(listing);
    setRentalTenantId('');
    setRentalTenantSearch('');
    setRentalTenantPhone('');
    setRentalWelcomeMessage(
      `Félicitations ! Votre location pour « ${listing.title} » (${listing.neighborhood}) est officiellement confirmée sur GidaColocs. Bienvenue dans la communauté !`,
    );
  };

  const handleLoadInspectVideoClip = async (listingId: string, clipId: string) => {
    if (inspectVideoCache[clipId] || loadingInspectVideoId === clipId) return;
    setLoadingInspectVideoId(clipId);
    try {
      const clip = await fetchListingVideoClip(listingId, clipId);
      if (clip?.dataUrl) {
        setInspectVideoCache((prev) => ({ ...prev, [clipId]: clip.dataUrl }));
      }
    } catch (err) {
      setAdminError(formatFirestoreErrorMessage(err, 'Impossible de charger ce clip vidéo.'));
    } finally {
      setLoadingInspectVideoId(null);
    }
  };

  const modListingsForStatus = allListings.filter((l) =>
    listingMatchesModerationStatus(l, moderationStatusFilter),
  );
  const modProfilesForStatus = allColocProfiles.filter(
    (p) => normalizeContentModStatus(p.moderationStatus) === moderationStatusFilter,
  );
  const modInterestsForStatus = allColocInterests.filter(
    (i) => normalizeContentModStatus(i.moderationStatus) === moderationStatusFilter,
  );
  const modMessagesForStatus = allColocMessages.filter(
    (m) => normalizeContentModStatus(m.moderationStatus) === moderationStatusFilter,
  );
  const modReviewsForStatus = allListingReviews.filter(
    (r) => normalizeContentModStatus(r.moderationStatus) === moderationStatusFilter,
  );

  const countForModStatus = (st: ContentModerationStatus) => {
    const lCount =
      moderationCategoryFilter === 'all' || moderationCategoryFilter === 'listings'
        ? allListings.filter((l) => listingMatchesModerationStatus(l, st)).length
        : 0;
    const pCount =
      moderationCategoryFilter === 'all' || moderationCategoryFilter === 'coloc_profiles'
        ? allColocProfiles.filter((p) => normalizeContentModStatus(p.moderationStatus) === st).length
        : 0;
    const iCount =
      moderationCategoryFilter === 'all' || moderationCategoryFilter === 'coloc_interests'
        ? allColocInterests.filter((i) => normalizeContentModStatus(i.moderationStatus) === st)
            .length
        : 0;
    const crCount =
      moderationCategoryFilter === 'all' || moderationCategoryFilter === 'comments_reviews'
        ? allColocMessages.filter((m) => normalizeContentModStatus(m.moderationStatus) === st)
            .length +
          allListingReviews.filter((r) => normalizeContentModStatus(r.moderationStatus) === st)
            .length
        : 0;
    return lCount + pCount + iCount + crCount;
  };

  const filteredListings = allListings.filter((item) => {
    if (listingStatusFilter === 'top_requested') {
      if (!item.topRequested || item.isTop) return false;
    } else if (listingStatusFilter === 'approved') {
      if (item.status !== 'published' && item.status !== 'reserved' && item.status !== 'rented') {
        return false;
      }
    } else if (listingStatusFilter !== 'all' && item.status !== listingStatusFilter) {
      return false;
    }
    const q = listingSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.neighborhood.toLowerCase().includes(q) ||
      (item.locationDetails || '').toLowerCase().includes(q) ||
      item.ownerName.toLowerCase().includes(q)
    );
  });

  const filteredOrders = allOrders.filter((ord) => {
    if (orderStatusFilter !== 'all' && ord.status !== orderStatusFilter) return false;
    if (orderTypeFilter !== 'all' && ord.orderType !== orderTypeFilter) return false;
    return true;
  });

  const filteredReports = allReports.filter((rep) =>
    reportStatusFilter === 'all' ? true : rep.status === reportStatusFilter,
  );

  const filteredColocReports = allColocReports.filter((rep) =>
    reportStatusFilter === 'all' ? true : rep.status === reportStatusFilter,
  );

  const filteredColocProfiles = allColocProfiles.filter((cp) => {
    if (colocStatusFilter !== 'all' && cp.status !== colocStatusFilter) return false;
    const q = colocSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      cp.authorName.toLowerCase().includes(q) ||
      cp.targetNeighborhood.toLowerCase().includes(q) ||
      cp.occupation.toLowerCase().includes(q)
    );
  });

  const filteredUsers = allUsers.filter((u) => {
    if (userRoleFilter !== 'all' && u.accountType !== userRoleFilter) return false;
    const status: AccountStatus = u.accountStatus === 'suspended' ? 'suspended' : 'active';
    if (userStatusFilter !== 'all' && status !== userStatusFilter) return false;
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.displayName.toLowerCase().includes(q) ||
      (u.neighborhood || '').toLowerCase().includes(q)
    );
  });

  const filteredActivities = activities.filter((act) => {
    if (historyTypeFilter !== 'all' && act.targetType !== historyTypeFilter) return false;
    const q = historySearch.trim().toLowerCase();
    if (!q) return true;
    return (
      act.actorName.toLowerCase().includes(q) ||
      act.action.toLowerCase().includes(q) ||
      act.targetTitle.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Administration GidaColocs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Modération des logements, commissions, réservations, réclamations, utilisateurs et audit
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allListings.length === 0 && (
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedStarters}
              className="px-3.5 py-2 text-xs font-medium text-teal-800 dark:text-teal-200 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 rounded-lg cursor-pointer whitespace-nowrap"
            >
              {seeding ? 'Initialisation...' : 'Initialiser 4 logements Maradi'}
            </button>
          )}
          <button
            type="button"
            onClick={onGoToPublish}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un logement</span>
          </button>
          <button
            type="button"
            onClick={() => void (onSignOut ? onSignOut() : signOutUser())}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-950/60 rounded-lg cursor-pointer whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            <span>Se déconnecter</span>
          </button>
        </div>
      </div>

      {/* 4-Column Admin KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Annonces & Top</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {allListings.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {pendingListingsCount} attente
            </span>{' '}
            · {approvedListingsCount} appr. · {rejectedListingsCount} ref. · {topActiveCount} Top
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pass Visite, Réserv. & Paiements</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {allOrders.length}{' '}
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              ({visitReservations.length} Pass · {reservedListingsCount} rés.)
            </span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {pendingOrdersCount} attente
            </span>{' '}
            · {verifiedOrdersCount} conf. · {rejectedOrdersCount} ref.
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Commissions encaissées</p>
          <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 tabular-nums mt-1">
            {formatFcfa(commissionStats.verifiedTotal)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            Générées : {formatFcfa(commissionStats.generatedTotal)}
            {commissionStats.pendingRevenue > 0
              ? ` (+${formatFcfa(commissionStats.pendingRevenue)} attente)`
              : ''}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Utilisateurs, Coloc & Réclam.</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {allUsers.length}{' '}
            <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
              (+{recentUsersCount} / 7j)
            </span>
          </p>
          <p
            className={`text-xs mt-1 tabular-nums ${
              openReportsCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {allColocProfiles.length} coloc · {openReportsCount} réclam. ouv.
            {suspendedUsersCount > 0 ? ` · ${suspendedUsersCount} susp.` : ''}
          </p>
        </div>
      </div>

      {/* Notifications Administrateur */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#0A2540] dark:text-teal-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Notifications administrateur
            </h3>
          </div>
          <span
            className={`text-xs font-semibold tabular-nums ${
              totalNotifications > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {totalNotifications > 0
              ? `${totalNotifications} action${totalNotifications > 1 ? 's' : ''} requise${totalNotifications > 1 ? 's' : ''}`
              : 'Tout est à jour'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              setModerationCategoryFilter('all');
              setModerationStatusFilter('pending');
              setTab('pending_queue');
            }}
            className="text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 transition-colors cursor-pointer"
          >
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Publications à valider
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {totalPendingModerationCount}
              {unreadAdminAlertsCount > 0 && (
                <span className="ml-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  ({unreadAdminAlertsCount} nouvelle{unreadAdminAlertsCount > 1 ? 's' : ''})
                </span>
              )}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setOrderStatusFilter('pending');
              setOrderTypeFilter('all');
              setTab('orders');
            }}
            className="text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 transition-colors cursor-pointer"
          >
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Paiements à vérifier
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {pendingOrdersCount}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setListingStatusFilter('top_requested');
              setTab('listings');
            }}
            className="text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 transition-colors cursor-pointer"
          >
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Demandes Annonce TOP
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {topRequestedCount}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportStatusFilter('open');
              setTab('reports');
            }}
            className="text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 transition-colors cursor-pointer"
          >
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Réclamations ouvertes
            </p>
            <p
              className={`text-lg font-bold tabular-nums mt-0.5 ${
                openReportsCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
              }`}
            >
              {openReportsCount}
            </p>
          </button>
        </div>
      </section>

      {/* Data Visualization Analytics Grid (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Volume d'annonces par quartier */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Volume d’annonces par quartier
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Répartition des biens immobiliers sur les zones de Maradi
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0D9488]" />
                <span>Disponibles</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#D97706]" />
                <span>Réservés</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#64748B]" />
                <span>En attente</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: rentedBarColor }}
                />
                <span>Pris / Loués</span>
              </span>
            </div>
          </div>

          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={neighborhoodChartData}
                margin={{ top: 8, right: 8, left: -18, bottom: 20 }}
                barCategoryGap="24%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStrokeColor} />
                <XAxis
                  dataKey="shortName"
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={{ stroke: gridStrokeColor }}
                  tickLine={false}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={46}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(10, 37, 64, 0.04)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const point = payload[0].payload as NeighborhoodChartPoint;
                    return (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 shadow-md text-xs space-y-1">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {point.neighborhood}
                        </p>
                        <p className="text-teal-700 dark:text-teal-400 tabular-nums">
                          Disponibles : {point.published}
                        </p>
                        <p className="text-amber-600 dark:text-amber-400 tabular-nums">
                          Réservés : {point.reserved}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                          En attente : {point.pending}
                        </p>
                        <p className="text-slate-700 dark:text-slate-300 tabular-nums">
                          Pris / Loués : {point.rented}
                        </p>
                        {point.avgPrice > 0 && (
                          <p className="pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 tabular-nums">
                            Loyer moyen : {formatFcfa(point.avgPrice)}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="published" stackId="a" fill="#0D9488" radius={[0, 0, 0, 0]} />
                <Bar dataKey="reserved" stackId="a" fill="#D97706" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="#64748B" radius={[0, 0, 0, 0]} />
                <Bar dataKey="rented" stackId="a" fill={rentedBarColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Chart 2: Évolution des inscriptions d'utilisateurs */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Évolution des inscriptions
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {tenantUsersCount} locataire{tenantUsersCount > 1 ? 's' : ''} ·{' '}
                {landlordUsersCount} bailleur{landlordUsersCount > 1 ? 's' : ''}
              </p>
            </div>
            <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 tabular-nums">
              {allUsers.length} inscrit{allUsers.length > 1 ? 's' : ''}
            </span>
          </div>

          {userGrowthChartData.length === 0 ? (
            <div className="h-[270px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              Les courbes apparaîtront dès les premières inscriptions.
            </div>
          ) : (
            <div className="h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={userGrowthChartData}
                  margin={{ top: 8, right: 12, left: -18, bottom: 20 }}
                >
                  <defs>
                    <linearGradient id="gidaColocsUsersGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9488" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#0D9488" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStrokeColor} />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fill: axisTickColor, fontSize: 11 }}
                    axisLine={{ stroke: gridStrokeColor }}
                    tickLine={false}
                    height={46}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: axisTickColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0].payload as UserGrowthChartPoint;
                      return (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 shadow-md text-xs space-y-1">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {pt.dateLabel}
                          </p>
                          <p className="text-teal-700 dark:text-teal-400 tabular-nums">
                            Total cumulé : {pt.cumul} utilisateur{pt.cumul > 1 ? 's' : ''}
                          </p>
                          <p className="text-slate-600 dark:text-slate-300 tabular-nums">
                            Nouvelles inscriptions : +{pt.nouveaux}
                          </p>
                          {(pt.tenants > 0 || pt.landlords > 0) && (
                            <p className="text-slate-500 dark:text-slate-400 tabular-nums">
                              {pt.tenants} locataire(s) · {pt.landlords} bailleur(s)
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumul"
                    stroke="#0D9488"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#gidaColocsUsersGradient)"
                    dot={{ r: 3.5, fill: '#0D9488', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#0A2540', stroke: '#0D9488', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
        {(
          [
            ['pending_queue', `Modération des publications (${totalPendingModerationCount})`],
            ['listings', `Annonces (${allListings.length})`],
            [
              'availability',
              `Réservations & Locations (${reservedListingsCount + rentedListingsCount + allRentalConfirmations.length + visitReservations.length})`,
            ],
            ['orders', `Paiements & Commissions (${allOrders.length})`],
            ['coloc', `Colocations (${allColocProfiles.length})`],
            ['reports', `Réclamations (${allReports.length + allColocReports.length})`],
            ['users', `Utilisateurs (${allUsers.length})`],
            ['history', `Historique (${activities.length})`],
            ['settings', 'Paramètres'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
              tab === key
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {adminError && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
          {adminError}
        </div>
      )}
      {adminSuccess && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">
          {adminSuccess}
        </div>
      )}

      {/* Tab 0: Modération centralisée des publications & Alertes */}
      {tab === 'pending_queue' && (
        <div className="space-y-6">
          {/* Alertes en temps réel */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#0A2540] dark:text-teal-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Alertes de nouvelles soumissions ({unreadAdminAlertsCount} non lue
                  {unreadAdminAlertsCount > 1 ? 's' : ''})
                </h3>
              </div>
              {unreadAdminAlertsCount > 0 && (
                <button
                  type="button"
                  disabled={busyActionId === 'read_all_alerts'}
                  onClick={() =>
                    void runAdminAction(
                      'read_all_alerts',
                      () => markAllAdminAlertsRead(unreadAdminAlerts.map((a) => a.id)),
                      'Toutes les alertes ont été marquées comme lues.',
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Tout marquer lu</span>
                </button>
              )}
            </div>

            {adminAlerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucune alerte de soumission enregistrée pour le moment.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {adminAlerts.slice(0, 20).map((alert) => {
                  const isListingAlert =
                    alert.type === 'new_listing' ||
                    alert.type === 'resubmitted_listing' ||
                    alert.type === 'rental_confirmed';
                  const linkedListing = isListingAlert
                    ? allListings.find((l) => l.id === alert.listingId)
                    : undefined;
                  const targetCategory: ModerationCategoryFilter =
                    alert.type === 'new_coloc_profile' || alert.type === 'resubmitted_coloc_profile'
                      ? 'coloc_profiles'
                      : alert.type === 'new_coloc_request'
                        ? 'coloc_interests'
                        : alert.type === 'new_comment' || alert.type === 'new_review'
                          ? 'comments_reviews'
                          : 'listings';
                  return (
                    <div
                      key={alert.id}
                      className={`px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        !alert.read ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {ADMIN_ALERT_PREFIX[alert.type] || 'Soumission : '}
                          {alert.listingTitle}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          {alert.neighborhood} · Auteur : {alert.ownerName}
                          {alert.depositorStatus
                            ? ` (${DEPOSITOR_STATUS_LABELS[alert.depositorStatus] || alert.depositorStatus})`
                            : ''}{' '}
                          · {formatTimestamp(alert.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {linkedListing ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!alert.read) void markAdminAlertRead(alert.id).catch(() => {});
                              setInspectListing(linkedListing);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Examiner le dossier</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!alert.read) void markAdminAlertRead(alert.id).catch(() => {});
                              setModerationCategoryFilter(targetCategory);
                              setModerationStatusFilter('pending');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Voir modération</span>
                          </button>
                        )}
                        {!alert.read && (
                          <button
                            type="button"
                            onClick={() =>
                              void runAdminAction(
                                `alert_${alert.id}`,
                                () => markAdminAlertRead(alert.id),
                                'Alerte marquée comme lue.',
                              )
                            }
                            className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                          >
                            Marquer lu
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Hub centralisé « Modération des publications » */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#0A2540] dark:text-teal-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Modération des publications ({totalPendingModerationCount} en attente)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Aucun contenu public n’est affiché aux visiteurs sans validation préalable de l’administrateur.
                    </p>
                  </div>
                </div>
              </div>

              {/* Filtres par catégorie de contenu */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    [
                      'all',
                      `Toutes (${
                        modListingsForStatus.length +
                        modProfilesForStatus.length +
                        modInterestsForStatus.length +
                        modMessagesForStatus.length +
                        modReviewsForStatus.length
                      })`,
                    ],
                    ['listings', `Annonces & Maisons (${modListingsForStatus.length})`],
                    ['coloc_profiles', `Profils colocataires (${modProfilesForStatus.length})`],
                    ['coloc_interests', `Demandes colocation (${modInterestsForStatus.length})`],
                    [
                      'comments_reviews',
                      `Avis & Commentaires (${modMessagesForStatus.length + modReviewsForStatus.length})`,
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setModerationCategoryFilter(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer tabular-nums ${
                      moderationCategoryFilter === key
                        ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Filtres par statut de modération */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                {(
                  [
                    ['pending', `En attente (${countForModStatus('pending')})`],
                    ['approved', `Approuvées (${countForModStatus('approved')})`],
                    ['needs_correction', `À corriger (${countForModStatus('needs_correction')})`],
                    ['rejected', `Refusées (${countForModStatus('rejected')})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setModerationStatusFilter(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer tabular-nums ${
                      moderationStatusFilter === key
                        ? key === 'approved'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : key === 'rejected'
                            ? 'border-red-600 bg-red-600 text-white'
                            : key === 'needs_correction'
                              ? 'border-amber-600 bg-amber-600 text-white'
                              : 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const showListings =
                moderationCategoryFilter === 'all' || moderationCategoryFilter === 'listings';
              const showProfiles =
                moderationCategoryFilter === 'all' || moderationCategoryFilter === 'coloc_profiles';
              const showInterests =
                moderationCategoryFilter === 'all' ||
                moderationCategoryFilter === 'coloc_interests';
              const showCommentsReviews =
                moderationCategoryFilter === 'all' ||
                moderationCategoryFilter === 'comments_reviews';

              const visibleListings = showListings ? modListingsForStatus : [];
              const visibleProfiles = showProfiles ? modProfilesForStatus : [];
              const visibleInterests = showInterests ? modInterestsForStatus : [];
              const visibleMessages = showCommentsReviews ? modMessagesForStatus : [];
              const visibleReviews = showCommentsReviews ? modReviewsForStatus : [];

              const totalVisible =
                visibleListings.length +
                visibleProfiles.length +
                visibleInterests.length +
                visibleMessages.length +
                visibleReviews.length;

              if (totalVisible === 0) {
                return (
                  <div className="p-10 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      Aucune publication dans cette sélection.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Toutes les soumissions (annonces, profils, demandes et avis) passent obligatoirement par cet espace avant toute visibilité publique.
                    </p>
                  </div>
                );
              }

              const renderContentHistory = (history?: ContentModerationEntry[]) => {
                if (!history || history.length === 0) return null;
                return (
                  <details className="mt-2 text-[11px]">
                    <summary className="cursor-pointer font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1">
                      <History className="w-3 h-3" />
                      <span>Historique des validations ({history.length})</span>
                    </summary>
                    <div className="mt-1.5 space-y-1 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
                      {history.map((entry, idx) => (
                        <p key={`${entry.atIso}-${idx}`} className="text-slate-600 dark:text-slate-300">
                          <strong>{CONTENT_MODERATION_LABELS[entry.status]}</strong> · {entry.reason}{' '}
                          <span className="text-slate-400">
                            — {entry.actorName} ({new Date(entry.atIso).toLocaleString('fr-FR')})
                          </span>
                        </p>
                      ))}
                    </div>
                  </details>
                );
              };

              return (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {/* 1. Annonces de chambres, logements et maisons */}
                  {visibleListings.map((item) => {
                    const isListingApproved =
                      item.status === 'published' ||
                      item.status === 'reserved' ||
                      item.status === 'rented';
                    return (
                      <div
                        key={`mod_listing_${item.id}`}
                        className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                      >
                        <div className="flex items-start gap-3.5 min-w-0">
                          {item.photos[0] ? (
                            <button
                              type="button"
                              onClick={() => setInspectListing(item)}
                              className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer bg-slate-100 dark:bg-slate-800"
                              title="Inspecter l’annonce et les photos"
                            >
                              <img
                                src={item.photos[0]}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 shrink-0 flex items-center justify-center text-slate-400">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                                {PROPERTY_TYPE_LABELS[item.propertyType]}
                              </span>
                              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                {LISTING_STATUS_LABELS[item.status]}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {item.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              {item.neighborhood}
                              {item.locationDetails ? ` (${item.locationDetails})` : ''} ·{' '}
                              {formatFcfa(item.priceFcfa)} / mois · {item.roomsCount || 1} pièce(s) ·{' '}
                              {item.photos.length} photo(s)
                              {item.videos?.length ? ` · ${item.videos.length} vidéo(s)` : ''}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                              Auteur : <strong>{item.ownerName}</strong> · Soumis{' '}
                              {formatTimestamp(item.createdAt)}
                            </p>
                            {item.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                            {item.moderationReason && (
                              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                Motif : {item.moderationReason}
                              </p>
                            )}
                            {item.moderationHistory && item.moderationHistory.length > 0 && (
                              <details className="mt-1 text-[11px]">
                                <summary className="cursor-pointer font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1">
                                  <History className="w-3 h-3" />
                                  <span>
                                    Historique des validations ({item.moderationHistory.length})
                                  </span>
                                </summary>
                                <div className="mt-1.5 space-y-1 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
                                  {item.moderationHistory.map((entry, idx) => (
                                    <p
                                      key={`${entry.atIso}-${idx}`}
                                      className="text-slate-600 dark:text-slate-300"
                                    >
                                      <strong>{LISTING_STATUS_LABELS[entry.status] || entry.status}</strong>{' '}
                                      · {entry.reason}{' '}
                                      <span className="text-slate-400">
                                        — {entry.actorName} (
                                        {new Date(entry.atIso).toLocaleString('fr-FR')})
                                      </span>
                                    </p>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setInspectListing(item)}
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Examiner dossier</span>
                          </button>

                          {item.status === 'pending' && (
                            <button
                              type="button"
                              disabled={busyActionId === item.id}
                              onClick={() =>
                                void runAdminAction(
                                  item.id,
                                  () =>
                                    adminModerateListing(
                                      item,
                                      {
                                        status: 'in_review',
                                        reason: 'Pris en charge pour vérification des photos et du déposant',
                                      },
                                      user,
                                      adminName,
                                    ),
                                  'Annonce passée en cours de vérification.',
                                )
                              }
                              className="px-2.5 py-2 text-xs font-medium text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg cursor-pointer"
                            >
                              En vérification
                            </button>
                          )}

                          {!isListingApproved && (
                            <button
                              type="button"
                              disabled={busyActionId === item.id}
                              onClick={() =>
                                void runAdminAction(
                                  item.id,
                                  () =>
                                    adminModerateListing(
                                      item,
                                      {
                                        status: 'published',
                                        isVerifiedQolock: true,
                                        reason: 'Logement vérifié et approuvé par l’administrateur',
                                      },
                                      user,
                                      adminName,
                                    ),
                                  'Annonce approuvée et publiée publiquement.',
                                )
                              }
                              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approuver</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={busyActionId === item.id}
                            onClick={() => {
                              setListingModerationTarget({
                                listing: item,
                                nextStatus: 'needs_correction',
                              });
                              setListingModerationReason('');
                            }}
                            className="px-2.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer"
                          >
                            Demander une correction
                          </button>

                          {item.status !== 'rejected' && item.status !== 'suspended' && (
                            <button
                              type="button"
                              disabled={busyActionId === item.id}
                              onClick={() => {
                                setListingModerationTarget({
                                  listing: item,
                                  nextStatus: 'rejected',
                                });
                                setListingModerationReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Refuser</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* 2. Profils publics de colocataires */}
                  {visibleProfiles.map((cp) => {
                    const modStatus = normalizeContentModStatus(cp.moderationStatus);
                    const actKey = `mod_cp_${cp.id}`;
                    return (
                      <div
                        key={`mod_profile_${cp.id}`}
                        className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                              Profil colocataire
                            </span>
                            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                              {CONTENT_MODERATION_LABELS[modStatus]}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {cp.authorName} · {cp.targetNeighborhood}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {COLOC_DESIRED_LABELS[cp.desiredType]} · Budget max{' '}
                            {formatFcfa(cp.maxBudgetFcfa)} · {COLOC_GENDER_LABELS[cp.genderPreference]} ·{' '}
                            {cp.occupation}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {cp.lifestyle} — {cp.bio}
                          </p>
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            Soumis {formatTimestamp(cp.createdAt)}
                          </p>
                          {cp.moderationReason && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300">
                              Motif : {cp.moderationReason}
                            </p>
                          )}
                          {renderContentHistory(cp.moderationHistory)}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {modStatus !== 'approved' && (
                            <button
                              type="button"
                              disabled={busyActionId === actKey}
                              onClick={() =>
                                void runAdminAction(
                                  actKey,
                                  () =>
                                    adminModerateColocProfile(
                                      cp,
                                      'approved',
                                      'Profil colocataire validé et publié',
                                      user,
                                      adminName,
                                    ),
                                  'Profil colocataire approuvé.',
                                )
                              }
                              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approuver</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyActionId === actKey}
                            onClick={() => {
                              setContentModerationTarget({
                                kind: 'coloc_profile',
                                item: cp,
                                decision: 'needs_correction',
                              });
                              setContentModerationReason('');
                            }}
                            className="px-2.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer"
                          >
                            Demander une correction
                          </button>
                          {modStatus !== 'rejected' && (
                            <button
                              type="button"
                              disabled={busyActionId === actKey}
                              onClick={() => {
                                setContentModerationTarget({
                                  kind: 'coloc_profile',
                                  item: cp,
                                  decision: 'rejected',
                                });
                                setContentModerationReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Refuser</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* 3. Demandes de colocation sur annonces */}
                  {visibleInterests.map((interest) => {
                    const modStatus = normalizeContentModStatus(interest.moderationStatus);
                    const actKey = `mod_ci_${interest.listingId || 'none'}_${interest.id}`;
                    const targetListing = allListings.find((l) => l.id === interest.listingId);
                    return (
                      <div
                        key={`mod_interest_${interest.listingId || 'x'}_${interest.id}`}
                        className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              Demande de colocation
                            </span>
                            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                              {CONTENT_MODERATION_LABELS[modStatus]}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {interest.userName} ·{' '}
                            {interest.listingTitle || targetListing?.title || interest.listingId || 'Logement'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {interest.occupation} · Habitudes : {interest.habits} · Budget{' '}
                            {formatFcfa(interest.budgetFcfa)}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            « {interest.message} »
                          </p>
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            Soumis {formatTimestamp(interest.createdAt)}
                          </p>
                          {interest.moderationReason && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300">
                              Motif : {interest.moderationReason}
                            </p>
                          )}
                          {renderContentHistory(interest.moderationHistory)}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {modStatus !== 'approved' && (
                            <button
                              type="button"
                              disabled={busyActionId === actKey}
                              onClick={() =>
                                void runAdminAction(
                                  actKey,
                                  () =>
                                    adminModerateColocInterest(
                                      interest,
                                      'approved',
                                      'Demande de colocation validée et publiée',
                                      user,
                                      adminName,
                                    ),
                                  'Demande de colocation approuvée.',
                                )
                              }
                              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approuver</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyActionId === actKey}
                            onClick={() => {
                              setContentModerationTarget({
                                kind: 'coloc_interest',
                                item: interest,
                                decision: 'needs_correction',
                              });
                              setContentModerationReason('');
                            }}
                            className="px-2.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer"
                          >
                            Demander une correction
                          </button>
                          {modStatus !== 'rejected' && (
                            <button
                              type="button"
                              disabled={busyActionId === actKey}
                              onClick={() => {
                                setContentModerationTarget({
                                  kind: 'coloc_interest',
                                  item: interest,
                                  decision: 'rejected',
                                });
                                setContentModerationReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Refuser</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* 4. Avis publics sur les logements */}
                  {visibleReviews.map((review) => {
                    const modStatus = normalizeContentModStatus(review.moderationStatus);
                    const actKey = `mod_rev_${review.id}`;
                    return (
                      <div
                        key={`mod_review_${review.id}`}
                        className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              Avis public ({review.rating}/5 ★)
                            </span>
                            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                              {CONTENT_MODERATION_LABELS[modStatus]}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {review.authorName} · {review.listingTitle || review.listingId}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            « {review.comment} »
                          </p>
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            Soumis {formatTimestamp(review.createdAt)}
                          </p>
                          {review.moderationReason && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300">
                              Motif : {review.moderationReason}
                            </p>
                          )}
                          {renderContentHistory(review.moderationHistory)}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {modStatus !== 'approved' && (
                            <button
                              type="button"
                              disabled={busyActionId === actKey}
                              onClick={() =>
                                void runAdminAction(
                                  actKey,
                                  () =>
                                    adminModerateListingReview(
                                      review,
                                      'approved',
                                      'Avis conforme et publié par l’administrateur',
                                      user,
                                      adminName,
                                    ),
                                  'Avis public approuvé.',
                                )
                              }
                              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approuver</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyActionId === actKey}
                            onClick={() => {
                              setContentModerationTarget({
                                kind: 'review',
                                item: review,
                                decision: 'needs_correction',
                              });
                              setContentModerationReason('');
                            }}
                            className="px-2.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer"
                          >
                            Demander une correction
                          </button>
                          {modStatus !== 'rejected' && (
                            <button
                              type="button"
                              disabled={busyActionId === actKey}
                              onClick={() => {
                                setContentModerationTarget({
                                  kind: 'review',
                                  item: review,
                                  decision: 'rejected',
                                });
                                setContentModerationReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Refuser</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* 5. Commentaires publics sur profils colocataires */}
                  {visibleMessages.map((msg) => {
                    const modStatus = normalizeContentModStatus(msg.moderationStatus);
                    const actKey = `mod_msg_${msg.id}`;
                    const targetProfile = allColocProfiles.find((p) => p.id === msg.profileId);
                    return (
                      <div
                        key={`mod_msg_${msg.id}`}
                        className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                              Commentaire colocation
                            </span>
                            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                              {CONTENT_MODERATION_LABELS[modStatus]}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {msg.authorName}
                            {targetProfile
                              ? ` → Profil de ${targetProfile.authorName} (${targetProfile.targetNeighborhood})`
                              : ''}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            « {msg.message} »
                          </p>
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            Soumis {formatTimestamp(msg.createdAt)}
                          </p>
                          {msg.moderationReason && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300">
                              Motif : {msg.moderationReason}
                            </p>
                          )}
                          {renderContentHistory(msg.moderationHistory)}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {modStatus !== 'approved' && (
                            <button
                              type="button"
                              disabled={busyActionId === actKey}
                              onClick={() =>
                                void runAdminAction(
                                  actKey,
                                  () =>
                                    adminModerateColocMessage(
                                      msg,
                                      'approved',
                                      'Commentaire public validé par l’administrateur',
                                      user,
                                      adminName,
                                    ),
                                  'Commentaire colocation approuvé.',
                                )
                              }
                              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approuver</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyActionId === actKey}
                            onClick={() => {
                              setContentModerationTarget({
                                kind: 'coloc_message',
                                item: msg,
                                decision: 'needs_correction',
                              });
                              setContentModerationReason('');
                            }}
                            className="px-2.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer"
                          >
                            Demander une correction
                          </button>
                          {modStatus !== 'rejected' && (
                            <button
                              type="button"
                              disabled={busyActionId === actKey}
                              onClick={() => {
                                setContentModerationTarget({
                                  kind: 'coloc_message',
                                  item: msg,
                                  decision: 'rejected',
                                });
                                setContentModerationReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Refuser</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        </div>
      )}

      {/* Tab 1: Listings Moderation */}
      {tab === 'listings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', `Toutes (${allListings.length})`],
                  ['pending', `En attente (${pendingOnlyListingsCount})`],
                  ['in_review', `En vérif. (${inReviewListingsCount})`],
                  ['needs_correction', `Corrections (${needsCorrectionListingsCount})`],
                  ['approved', `Approuvées (${approvedListingsCount})`],
                  ['rejected', `Refusées (${rejectedListingsCount})`],
                  ['suspended', `Suspendues (${suspendedListingsCount})`],
                  ['top_requested', `Demandes TOP (${topRequestedCount})`],
                  ['published', `Disponibles (${publishedListingsCount})`],
                  ['reserved', `Réservés (${reservedListingsCount})`],
                  ['rented', `Pris (${rentedListingsCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setListingStatusFilter(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer tabular-nums ${
                    listingStatusFilter === key
                      ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={listingSearch}
                onChange={(e) => setListingSearch(e.target.value)}
                placeholder="Rechercher logement, quartier..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {filteredListings.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucun logement ne correspond à ce filtre.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredListings.map((item) => {
                const isConfirmingDelete = confirmDeleteId === item.id;
                const isApproved =
                  item.status === 'published' ||
                  item.status === 'reserved' ||
                  item.status === 'rented';
                const isPendingStage =
                  item.status === 'pending' ||
                  item.status === 'in_review' ||
                  item.status === 'needs_correction';

                return (
                  <div
                    key={item.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                        {item.neighborhood} · {formatFcfa(item.priceFcfa)} / mois · Par{' '}
                        {item.ownerName} ·{' '}
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
                        {item.topRequested && !item.isTop ? ' · Demande TOP en attente' : ''}
                      </p>
                      {(item.status === 'rejected' ||
                        item.status === 'suspended' ||
                        item.status === 'needs_correction') &&
                        item.moderationReason && (
                          <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                            Motif : {item.moderationReason}
                          </p>
                        )}
                      {item.validatedByName && item.validatedAtIso && (
                        <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                          Décision : {item.validatedByName} ({new Date(item.validatedAtIso).toLocaleDateString('fr-FR')})
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setInspectListing(item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Examiner</span>
                      </button>

                      {isPendingStage && (
                        <>
                          <button
                            type="button"
                            disabled={busyActionId === item.id}
                            onClick={() =>
                              void runAdminAction(
                                item.id,
                                () =>
                                  adminModerateListing(
                                    item,
                                    {
                                      status: 'published',
                                      isVerifiedQolock: true,
                                      reason: 'Logement conforme, validé et publié',
                                    },
                                    user,
                                    adminName,
                                  ),
                                'Annonce approuvée et publiée.',
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approuver</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyActionId === item.id}
                            onClick={() => {
                              setListingModerationTarget({
                                listing: item,
                                nextStatus: 'needs_correction',
                              });
                              setListingModerationReason('');
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            Corrections
                          </button>
                          <button
                            type="button"
                            disabled={busyActionId === item.id}
                            onClick={() => {
                              setListingModerationTarget({ listing: item, nextStatus: 'rejected' });
                              setListingModerationReason('');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Refuser</span>
                          </button>
                        </>
                      )}

                      {(item.status === 'published' || item.status === 'reserved') && (
                        <button
                          type="button"
                          onClick={() => openConfirmRentalModal(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Confirmer location</span>
                        </button>
                      )}

                      {(item.status === 'rejected' || item.status === 'suspended') && (
                        <button
                          type="button"
                          disabled={busyActionId === item.id}
                          onClick={() =>
                            void runAdminAction(
                              item.id,
                              () =>
                                adminModerateListing(
                                  item,
                                  {
                                    status: 'published',
                                    isVerifiedQolock: true,
                                    reason: 'Annonce réactivée et approuvée',
                                  },
                                  user,
                                  adminName,
                                ),
                              'Annonce approuvée et republiée.',
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approuver / Réactiver</span>
                        </button>
                      )}

                      {isApproved && (
                        <button
                          type="button"
                          disabled={busyActionId === item.id}
                          onClick={() => {
                            setListingModerationTarget({ listing: item, nextStatus: 'suspended' });
                            setListingModerationReason('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Suspendre</span>
                        </button>
                      )}

                      {isApproved && item.status !== 'reserved' && (
                        <button
                          type="button"
                          disabled={busyActionId === item.id}
                          onClick={() =>
                            void runAdminAction(
                              item.id,
                              () =>
                                updateListingAvailabilityStatus(item, 'reserved', user, adminName),
                              'Logement marqué réservé.',
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50 cursor-pointer"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          <span>Réservé</span>
                        </button>
                      )}

                      {isApproved && item.status !== 'rented' && (
                        <button
                          type="button"
                          disabled={busyActionId === item.id}
                          onClick={() =>
                            void runAdminAction(
                              item.id,
                              () => updateListingAvailabilityStatus(item, 'rented', user, adminName),
                              'Logement marqué pris / loué.',
                            )
                          }
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                        >
                          Marquer pris
                        </button>
                      )}

                      {isApproved && item.status !== 'published' && (
                        <button
                          type="button"
                          disabled={busyActionId === item.id}
                          onClick={() =>
                            void runAdminAction(
                              item.id,
                              () =>
                                updateListingAvailabilityStatus(item, 'published', user, adminName),
                              'Logement remis disponible.',
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-800 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/40 disabled:opacity-50 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Disponible</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyActionId === item.id}
                        onClick={() =>
                          void runAdminAction(
                            item.id,
                            () =>
                              adminUpdateListingStatusAndBadges(
                                item,
                                { isVerifiedQolock: !item.isVerifiedQolock },
                                user,
                                adminName,
                              ),
                            item.isVerifiedQolock
                              ? 'Badge Vérifié retiré.'
                              : 'Badge Vérifié activé.',
                          )
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 cursor-pointer ${
                          item.isVerifiedQolock
                            ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Vérifié</span>
                      </button>

                      <button
                        type="button"
                        disabled={busyActionId === item.id}
                        onClick={() =>
                          void runAdminAction(
                            item.id,
                            () =>
                              adminUpdateListingStatusAndBadges(
                                item,
                                { isTop: !item.isTop, topRequested: false },
                                user,
                                adminName,
                              ),
                            item.isTop ? 'Mise en avant TOP retirée.' : 'Annonce TOP activée.',
                          )
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 cursor-pointer ${
                          item.isTop
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span>TOP</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onEditListing(item)}
                        aria-label="Modifier"
                        className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {isConfirmingDelete ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyActionId === item.id}
                            onClick={() =>
                              void runAdminAction(
                                item.id,
                                async () => {
                                  await deleteListingById(item, user, adminName);
                                  setConfirmDeleteId(null);
                                },
                                'Annonce supprimée.',
                              )
                            }
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label="Enlever l'annonce"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Réservations, Visites & Pris */}
      {tab === 'availability' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Espace Pris & Réservés
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {publishedListingsCount} disponible{publishedListingsCount > 1 ? 's' : ''} ·{' '}
                {reservedListingsCount} réservé{reservedListingsCount > 1 ? 's' : ''} ·{' '}
                {rentedListingsCount} pris / loué{rentedListingsCount > 1 ? 's' : ''}
              </p>
            </div>

            {rentedListingsCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {confirmBulkPurge ? (
                  <>
                    <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                      Supprimer définitivement {rentedListingsCount} logement(s) pris ?
                    </span>
                    <button
                      type="button"
                      disabled={purgingRented}
                      onClick={handleBulkPurgeRented}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg cursor-pointer"
                    >
                      {purgingRented ? 'Suppression...' : 'Confirmer tout enlever'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmBulkPurge(false)}
                      className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmBulkPurge(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 hover:bg-red-100 rounded-lg cursor-pointer tabular-nums"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Enlever tous les logements pris ({rentedListingsCount})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
              {(
                [
                  [
                    'all',
                    `Tous suivis (${publishedListingsCount + reservedListingsCount + rentedListingsCount})`,
                  ],
                  ['reserved', `Réservés (${reservedListingsCount})`],
                  ['rented', `Pris / Loués (${rentedListingsCount})`],
                  ['published', `Disponibles (${publishedListingsCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAvailabilityFilter(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer tabular-nums ${
                    availabilityFilter === key
                      ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(() => {
              const managedListings = allListings
                .filter(
                  (l) =>
                    l.status === 'published' || l.status === 'reserved' || l.status === 'rented',
                )
                .filter((l) =>
                  availabilityFilter === 'all' ? true : l.status === availabilityFilter,
                );

              if (managedListings.length === 0) {
                return (
                  <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Aucun logement dans cette catégorie pour le moment.
                  </div>
                );
              }

              return (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {managedListings.map((item) => {
                    const isConfirmingDelete = confirmDeleteId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                            {item.neighborhood} · {formatFcfa(item.priceFcfa)} / mois · Par{' '}
                            {item.ownerName} ·{' '}
                            <span
                              className={
                                item.status === 'published'
                                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : item.status === 'reserved'
                                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                    : 'text-slate-600 dark:text-slate-300 font-semibold'
                              }
                            >
                              {LISTING_STATUS_LABELS[item.status]}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={item.status === 'published' || busyActionId === item.id}
                            onClick={() =>
                              void runAdminAction(
                                item.id,
                                () =>
                                  updateListingAvailabilityStatus(
                                    item,
                                    'published',
                                    user,
                                    adminName,
                                  ),
                                'Logement remis disponible.',
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer disabled:opacity-45 disabled:cursor-default ${
                              item.status === 'published'
                                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Disponible</span>
                          </button>

                          <button
                            type="button"
                            disabled={item.status === 'reserved' || busyActionId === item.id}
                            onClick={() =>
                              void runAdminAction(
                                item.id,
                                () =>
                                  updateListingAvailabilityStatus(
                                    item,
                                    'reserved',
                                    user,
                                    adminName,
                                  ),
                                'Logement marqué réservé.',
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer disabled:opacity-45 disabled:cursor-default ${
                              item.status === 'reserved'
                                ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                                : 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                            }`}
                          >
                            <BookmarkCheck className="w-3.5 h-3.5" />
                            <span>Marquer réservé</span>
                          </button>

                          <button
                            type="button"
                            disabled={item.status === 'rented' || busyActionId === item.id}
                            onClick={() =>
                              void runAdminAction(
                                item.id,
                                () =>
                                  updateListingAvailabilityStatus(item, 'rented', user, adminName),
                                'Logement marqué pris / loué.',
                              )
                            }
                            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border cursor-pointer disabled:opacity-45 disabled:cursor-default ${
                              item.status === 'rented'
                                ? 'border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            Marquer pris
                          </button>

                          {isConfirmingDelete ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busyActionId === item.id}
                                onClick={() =>
                                  void runAdminAction(
                                    item.id,
                                    async () => {
                                      await deleteListingById(item, user, adminName);
                                      setConfirmDeleteId(null);
                                    },
                                    'Annonce enlevée définitivement.',
                                  )
                                }
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Enlever</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Demandes de visite & Réservations Pass Visite */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#0A2540] dark:text-teal-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Demandes de visite & Réservations (Pass Visite)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Suivi des rendez-vous de visite demandés par les locataires et étudiants
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                {visitReservations.length} demande{visitReservations.length > 1 ? 's' : ''}
              </span>
            </div>

            {visitReservations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucune demande de visite Pass Visite enregistrée pour le moment.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {visitReservations.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {ord.listingTitle || 'Logement'} · {ord.userName} ({ord.userPhone})
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                        Date souhaitée :{' '}
                        <strong>{ord.preferredDate || 'Dès que possible'}</strong> ·{' '}
                        {ord.paymentMethod} (Réf : {ord.transactionRef}) ·{' '}
                        {formatTimestamp(ord.createdAt)}
                      </p>
                      {ord.receiptNumber && (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                          Reçu : {ord.receiptNumber}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {(ord.proofImage || (ord.verificationHistory && ord.verificationHistory.length > 0)) && (
                        <button
                          type="button"
                          onClick={() => setPreviewProofOrder(ord)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{ord.proofImage ? 'Voir preuve' : 'Détails'}</span>
                        </button>
                      )}
                      <a
                        href={buildWhatsAppUrl(
                          ord.userPhone,
                          `Bonjour ${ord.userName}, concernant votre demande de visite GidaColocs pour "${ord.listingTitle}" : `,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Contacter</span>
                      </a>
                      {ord.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            disabled={busyActionId === ord.id}
                            onClick={() =>
                              void runAdminAction(
                                ord.id,
                                () => adminVerifyServiceOrder(ord, user, adminName),
                                'Visite confirmée et contact bailleur débloqué.',
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirmer & Débloquer</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyActionId === ord.id}
                            onClick={() => {
                              setOrderActionTarget({ order: ord, nextStatus: 'rejected' });
                              setOrderActionReason('');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Refuser</span>
                          </button>
                        </>
                      ) : (
                        <>
                          {ord.status === 'verified' && (
                            <button
                              type="button"
                              onClick={() => downloadPaymentReceipt(ord)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0A2540] dark:text-teal-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Reçu</span>
                            </button>
                          )}
                          <span
                            className={`text-xs font-semibold ${
                              ord.status === 'verified'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {ORDER_STATUS_LABELS[ord.status]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Locations officiellement confirmées */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Locations confirmées & accès communauté WhatsApp
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Chaque confirmation débloque le message de bienvenue et le bouton communautaire WhatsApp pour le locataire concerné
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                {allRentalConfirmations.length} location{allRentalConfirmations.length > 1 ? 's' : ''}
              </span>
            </div>

            {allRentalConfirmations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucune location confirmée pour le moment. Utilisez « Confirmer location » sur un logement approuvé dès qu’un locataire s’installe.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {allRentalConfirmations.map((conf) => (
                  <div
                    key={conf.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {conf.listingTitle} · {conf.neighborhood} · {formatFcfa(conf.priceFcfa)} / mois
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        Locataire : <strong>{conf.tenantName}</strong>
                        {conf.tenantPhone ? ` (${conf.tenantPhone})` : ''} · Bailleur :{' '}
                        {conf.landlordName}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        Confirmée le {new Date(conf.confirmedAtIso).toLocaleString('fr-FR')} par{' '}
                        {conf.confirmedByName}
                      </p>
                    </div>
                    <a
                      href={officialCommunityUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 rounded-lg shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Lien WhatsApp officiel</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Paiements & Suivi des commissions */}
      {tab === 'orders' && (
        <div className="space-y-6">
          {/* Suivi des commissions */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Suivi des commissions & encaissements
                </h3>
              </div>
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 tabular-nums">
                Générées : {formatFcfa(commissionStats.generatedTotal)} · Encaissées :{' '}
                {formatFcfa(commissionStats.verifiedTotal)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Commissions Pass visite
                </p>
                <p className="text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {formatFcfa(commissionStats.visitPassRevenue)}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {commissionStats.visitPassCount} pass confirmé{commissionStats.visitPassCount > 1 ? 's' : ''}
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Commissions Annonces Top
                </p>
                <p className="text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {formatFcfa(commissionStats.topListingRevenue)}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {commissionStats.topListingCount} boost{commissionStats.topListingCount > 1 ? 's' : ''} confirmé{commissionStats.topListingCount > 1 ? 's' : ''}
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Commissions en attente
                </p>
                <p className="text-base font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                  {formatFcfa(commissionStats.pendingRevenue)}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {pendingOrdersCount} paiement{pendingOrdersCount > 1 ? 's' : ''} à vérifier
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Total encaissé
                </p>
                <p className="text-base font-bold text-teal-700 dark:text-teal-400 tabular-nums mt-0.5">
                  {formatFcfa(commissionStats.verifiedTotal)}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {commissionStats.contractCount > 0
                    ? `dont ${formatFcfa(commissionStats.contractRevenue)} d’archives contrat`
                    : `${commissionStats.visitPassCount + commissionStats.topListingCount} paiement(s) confirmé(s)`}
                </p>
              </div>
            </div>

            {commissionStats.channels.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  Par canal encaissé :
                </span>
                {commissionStats.channels.map(([method, info]) => (
                  <span
                    key={method}
                    className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 tabular-nums"
                  >
                    {method} : <strong>{formatFcfa(info.total)}</strong> ({info.count})
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Liste des paiements */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['all', `Tous (${allOrders.length})`],
                    ['pending', `En attente (${pendingOrdersCount})`],
                    ['verified', 'Confirmés'],
                    ['rejected', 'Refusés'],
                    ['failed', 'Échoués'],
                    ['refunded', 'Remboursés'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOrderStatusFilter(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer tabular-nums ${
                      orderStatusFilter === key
                        ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <select
                value={orderTypeFilter}
                onChange={(e) => setOrderTypeFilter(e.target.value as 'all' | OrderType)}
                aria-label="Filtrer par type de service"
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
              >
                <option value="all">Tous les services</option>
                <option value="visit_pass">Pass visite</option>
                <option value="top_listing">Annonce Top</option>
                {allOrders.some((o) => o.orderType === 'contract') && (
                  <option value="contract">Archives contrat (historique)</option>
                )}
              </select>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucune commande ou paiement correspondant à ce filtre.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {ord.proofImage && (
                        <button
                          type="button"
                          onClick={() => setPreviewProofOrder(ord)}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                          title="Voir la capture de preuve"
                        >
                          <img
                            src={ord.proofImage}
                            alt={`Preuve ${ord.transactionRef}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {ORDER_TYPE_LABELS[ord.orderType]} · {ord.userName} ({ord.userPhone})
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                          {ord.listingTitle} · {formatFcfa(ord.amountFcfa)}
                          {ord.durationDays ? ` (${ord.durationDays} j)` : ''} · {ord.paymentMethod}{' '}
                          (Réf : <strong>{ord.transactionRef}</strong>) ·{' '}
                          {formatTimestamp(ord.createdAt)}
                          {ord.preferredDate ? ` · Visite souhaitée : ${ord.preferredDate}` : ''}
                        </p>
                        {ord.beneficiaryPhone && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                            Compte destinataire : {ord.beneficiaryPhone}
                            {ord.receiptNumber ? ` · Reçu : ${ord.receiptNumber}` : ''}
                          </p>
                        )}
                        {!ord.beneficiaryPhone && ord.receiptNumber && (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                            Reçu officiel : {ord.receiptNumber}
                          </p>
                        )}
                        {(ord.rejectionReason || ord.adminNote) && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Note : {ord.rejectionReason || ord.adminNote}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewProofOrder(ord)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Preuve / Historique</span>
                      </button>

                      {ord.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            disabled={busyActionId === ord.id}
                            onClick={() =>
                              void runAdminAction(
                                ord.id,
                                () => adminVerifyServiceOrder(ord, user, adminName),
                                'Paiement confirmé et accès débloqué.',
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirmer & Débloquer</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyActionId === ord.id}
                            onClick={() => {
                              setOrderActionTarget({ order: ord, nextStatus: 'rejected' });
                              setOrderActionReason('');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Refuser</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyActionId === ord.id}
                            onClick={() => {
                              setOrderActionTarget({ order: ord, nextStatus: 'failed' });
                              setOrderActionReason('');
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            Échoué
                          </button>
                        </>
                      ) : ord.status === 'verified' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => downloadPaymentReceipt(ord)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0A2540] dark:text-teal-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Reçu</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyActionId === ord.id}
                            onClick={() => {
                              setOrderActionTarget({ order: ord, nextStatus: 'refunded' });
                              setOrderActionReason('');
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            Rembourser
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-semibold ${
                            ord.status === 'refunded'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {ORDER_STATUS_LABELS[ord.status]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3b: Recherches de colocataires */}
      {tab === 'coloc' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', `Toutes (${allColocProfiles.length})`],
                  ['active', `Actives (${activeColocProfilesCount})`],
                  ['found', `Trouvées (${foundColocProfilesCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColocStatusFilter(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer tabular-nums ${
                    colocStatusFilter === key
                      ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={colocSearch}
                onChange={(e) => setColocSearch(e.target.value)}
                placeholder="Rechercher profil, quartier..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {filteredColocProfiles.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucune recherche de colocataire dans cette catégorie.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredColocProfiles.map((cp) => {
                const isConfirming = confirmDeleteColocId === cp.id;
                const modStatus = normalizeContentModStatus(cp.moderationStatus);
                return (
                  <div
                    key={cp.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Users className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {cp.authorName}
                        </p>
                        {cp.statusCategory && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            ({COLOC_STATUS_CATEGORY_LABELS[cp.statusCategory]})
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                            cp.status === 'active'
                              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {cp.status === 'active' ? 'Active' : 'Coloc trouvé'}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                            modStatus === 'approved'
                              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                              : modStatus === 'rejected'
                                ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                                : 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {CONTENT_MODERATION_LABELS[modStatus]}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {cp.targetNeighborhood} · {COLOC_DESIRED_LABELS[cp.desiredType]} · Budget max{' '}
                        {formatFcfa(cp.maxBudgetFcfa)} · {COLOC_GENDER_LABELS[cp.genderPreference]}
                        {cp.desiredRoommatesCount ? ` · ${cp.desiredRoommatesCount} colocataire(s)` : ''}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {cp.occupation} · {cp.lifestyle} — {cp.bio}
                      </p>
                      {cp.moderationReason && modStatus !== 'approved' && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">
                          Motif modération : {cp.moderationReason}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        Publié {formatTimestamp(cp.createdAt)}
                        {cp.availability ? ` · Dispo : ${cp.availability}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {modStatus !== 'approved' && (
                        <button
                          type="button"
                          disabled={busyActionId === `mod_cp_${cp.id}`}
                          onClick={() =>
                            void runAdminAction(
                              `mod_cp_${cp.id}`,
                              () =>
                                adminModerateColocProfile(
                                  cp,
                                  'approved',
                                  'Profil colocataire validé par l’administrateur',
                                  user,
                                  adminName,
                                ),
                              'Profil colocataire approuvé.',
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approuver</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyActionId === `mod_cp_${cp.id}`}
                        onClick={() => {
                          setContentModerationTarget({
                            kind: 'coloc_profile',
                            item: cp,
                            decision: 'needs_correction',
                          });
                          setContentModerationReason('');
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer"
                      >
                        Corriger
                      </button>

                      {modStatus !== 'rejected' && (
                        <button
                          type="button"
                          disabled={busyActionId === `mod_cp_${cp.id}`}
                          onClick={() => {
                            setContentModerationTarget({
                              kind: 'coloc_profile',
                              item: cp,
                              decision: 'rejected',
                            });
                            setContentModerationReason('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Refuser</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyActionId === `coloc_status_${cp.id}`}
                        onClick={() =>
                          void runAdminAction(
                            `coloc_status_${cp.id}`,
                            () =>
                              updateColocProfileStatus(
                                cp.id,
                                cp.status === 'active' ? 'found' : 'active',
                                user,
                                adminName,
                              ),
                            cp.status === 'active'
                              ? 'Recherche marquée comme clôturée.'
                              : 'Recherche réactivée.',
                          )
                        }
                        className="px-3 py-1.5 text-xs font-medium text-[#0A2540] dark:text-teal-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        {cp.status === 'active' ? 'Clôturer (trouvé)' : 'Réactiver'}
                      </button>

                      {isConfirming ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyActionId === `coloc_del_${cp.id}`}
                            onClick={() =>
                              void runAdminAction(
                                `coloc_del_${cp.id}`,
                                async () => {
                                  await deleteColocProfile(cp.id, user, adminName);
                                  setConfirmDeleteColocId(null);
                                },
                                'Annonce colocation supprimée.',
                              )
                            }
                            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteColocId(null)}
                            className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteColocId(cp.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Supprimer</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Réclamations & Signalements (Annonces + Colocation) */}
      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['all', `Tous (${allReports.length + allColocReports.length})`],
                    ['open', `Ouverts (${openReportsCount})`],
                    ['resolved', 'Traités'],
                    ['dismissed', 'Classés'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setReportStatusFilter(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer tabular-nums ${
                      reportStatusFilter === key
                        ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {allReports.length} annonce(s) · {allColocReports.length} colocation(s)
              </span>
            </div>

            {filteredReports.length === 0 && filteredColocReports.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucune réclamation ou signalement dans cette catégorie.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredReports.map((rep) => {
                  const targetListing = allListings.find((l) => l.id === rep.listingId);
                  return (
                    <div
                      key={rep.id}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 ${
                              rep.status === 'open'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-400'
                            }`}
                          />
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                            Annonce
                          </span>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {rep.listingTitle}
                          </p>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          Par <strong>{rep.reporterName}</strong> · Motif :{' '}
                          {REPORT_REASON_LABELS[rep.reason] || rep.reason} — {rep.details}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                          {formatTimestamp(rep.createdAt)} · Statut :{' '}
                          {REPORT_STATUS_LABELS[rep.status]}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {rep.status === 'open' &&
                          targetListing &&
                          targetListing.status !== 'rented' && (
                            <button
                              type="button"
                              disabled={busyActionId === `${rep.id}_rent`}
                              onClick={() =>
                                void runAdminAction(
                                  `${rep.id}_rent`,
                                  async () => {
                                    await updateListingAvailabilityStatus(
                                      targetListing,
                                      'rented',
                                      user,
                                      adminName,
                                    );
                                    await adminUpdateReportStatus(
                                      rep.id,
                                      rep.listingTitle,
                                      'resolved',
                                      user,
                                      adminName,
                                    );
                                  },
                                  'Logement marqué pris et réclamation traitée.',
                                )
                              }
                              className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              Marquer pris & traiter
                            </button>
                          )}
                        {rep.status === 'open' ? (
                          <>
                            <button
                              type="button"
                              disabled={busyActionId === rep.id}
                              onClick={() =>
                                void runAdminAction(
                                  rep.id,
                                  () =>
                                    adminUpdateReportStatus(
                                      rep.id,
                                      rep.listingTitle,
                                      'resolved',
                                      user,
                                      adminName,
                                    ),
                                  'Réclamation marquée traitée.',
                                )
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              Marquer traité
                            </button>
                            <button
                              type="button"
                              disabled={busyActionId === rep.id}
                              onClick={() =>
                                void runAdminAction(
                                  rep.id,
                                  () =>
                                    adminUpdateReportStatus(
                                      rep.id,
                                      rep.listingTitle,
                                      'dismissed',
                                      user,
                                      adminName,
                                    ),
                                  'Réclamation classée sans suite.',
                                )
                              }
                              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              Classer
                            </button>
                          </>
                        ) : (
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {REPORT_STATUS_LABELS[rep.status]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredColocReports.map((crep) => {
                  const reportedProfile = allUsers.find((u) => u.uid === crep.reportedUserId);
                  return (
                    <div
                      key={crep.id}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/40 dark:bg-slate-950/30"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 ${
                              crep.status === 'open'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-slate-400'
                            }`}
                          />
                          <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 uppercase">
                            Colocation ({crep.contextType.replace('coloc_', '')})
                          </span>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            Utilisateur signalé : {crep.reportedUserName}
                          </p>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          Par <strong>{crep.reporterName}</strong> · Motif : {crep.reason} —{' '}
                          {crep.details}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                          {formatTimestamp(crep.createdAt)} · Statut :{' '}
                          {REPORT_STATUS_LABELS[crep.status]}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {crep.status === 'open' &&
                          reportedProfile &&
                          reportedProfile.uid !== user.uid &&
                          reportedProfile.accountStatus !== 'suspended' && (
                            <button
                              type="button"
                              onClick={() => {
                                setUserSuspendTarget(reportedProfile);
                                setUserSuspendReason(`Signalement colocation : ${crep.reason}`);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Suspendre compte</span>
                            </button>
                          )}
                        {crep.status === 'open' ? (
                          <>
                            <button
                              type="button"
                              disabled={busyActionId === crep.id}
                              onClick={() =>
                                void runAdminAction(
                                  crep.id,
                                  () =>
                                    adminUpdateColocReportStatus(
                                      crep.id,
                                      `${crep.reportedUserName} (${crep.reason})`,
                                      'resolved',
                                      user,
                                      adminName,
                                    ),
                                  'Signalement colocation marqué traité.',
                                )
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              Marquer traité
                            </button>
                            <button
                              type="button"
                              disabled={busyActionId === crep.id}
                              onClick={() =>
                                void runAdminAction(
                                  crep.id,
                                  () =>
                                    adminUpdateColocReportStatus(
                                      crep.id,
                                      `${crep.reportedUserName} (${crep.reason})`,
                                      'dismissed',
                                      user,
                                      adminName,
                                    ),
                                  'Signalement colocation classé sans suite.',
                                )
                              }
                              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
                            >
                              Classer
                            </button>
                          </>
                        ) : (
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {REPORT_STATUS_LABELS[crep.status]}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Gestion des utilisateurs */}
      {tab === 'users' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', `Tous (${allUsers.length})`],
                  ['tenant', `Locataires (${tenantUsersCount})`],
                  ['landlord', `Bailleurs (${landlordUsersCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setUserRoleFilter(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer tabular-nums ${
                    userRoleFilter === key
                      ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}

              <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>

              {(
                [
                  ['all', 'Tous statuts'],
                  ['active', `Actifs (${activeUsersCount})`],
                  ['suspended', `Suspendus (${suspendedUsersCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={`status_${key}`}
                  type="button"
                  onClick={() => setUserStatusFilter(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer tabular-nums ${
                    userStatusFilter === key
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Rechercher nom, quartier..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucun utilisateur trouvé.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const listingsCount = userActivityCounts.listingsByOwner.get(u.uid) || 0;
                const ordersCount = userActivityCounts.ordersByUser.get(u.uid) || 0;
                const contactLoaded = Object.prototype.hasOwnProperty.call(userContacts, u.uid);
                const contact = userContacts[u.uid];
                const isUserSuspended = u.accountStatus === 'suspended';
                const isSelf = u.uid === user.uid;

                return (
                  <div
                    key={u.uid}
                    className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {u.displayName}
                        </p>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                            isUserSuspended
                              ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                              : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {ACCOUNT_STATUS_LABELS[isUserSuspended ? 'suspended' : 'active']}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        {u.neighborhood || 'Quartier non renseigné'} ·{' '}
                        {ACCOUNT_TYPE_LABELS[u.accountType]} · {listingsCount} annonce
                        {listingsCount > 1 ? 's' : ''} · {ordersCount} commande
                        {ordersCount > 1 ? 's' : ''} · {formatTimestamp(u.createdAt)}
                      </p>
                      {isUserSuspended && u.suspendedReason && (
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                          Motif suspension : {u.suspendedReason}
                        </p>
                      )}
                      {contactLoaded && (
                        <p className="text-xs text-teal-700 dark:text-teal-400 mt-1 tabular-nums">
                          {contact?.phone ? `Tél/WhatsApp : ${contact.phone}` : 'Téléphone non renseigné'}
                          {contact?.email ? ` · ${contact.email}` : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!contactLoaded ? (
                        <button
                          type="button"
                          disabled={loadingContactUid === u.uid}
                          onClick={() => void handleLoadUserContact(u.uid)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>
                            {loadingContactUid === u.uid ? 'Chargement...' : 'Voir contact'}
                          </span>
                        </button>
                      ) : (
                        contact?.phone && (
                          <a
                            href={buildWhatsAppUrl(
                              contact.phone,
                              `Bonjour ${u.displayName}, message de l’administration GidaColocs : `,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )
                      )}

                      <select
                        value={u.accountType}
                        disabled={busyActionId === u.uid}
                        onChange={(e) =>
                          void runAdminAction(
                            u.uid,
                            () =>
                              adminUpdateUserAccountType(u.uid, e.target.value as AccountType),
                            'Type de compte mis à jour.',
                          )
                        }
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 cursor-pointer"
                      >
                        <option value="tenant">Étudiant / Locataire</option>
                        <option value="landlord">Propriétaire / Démarcheur</option>
                      </select>

                      {!isSelf &&
                        (isUserSuspended ? (
                          <button
                            type="button"
                            disabled={busyActionId === `susp_${u.uid}`}
                            onClick={() =>
                              void runAdminAction(
                                `susp_${u.uid}`,
                                () =>
                                  adminSetUserAccountStatus(u, 'active', '', user, adminName),
                                `Compte de ${u.displayName} réactivé.`,
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Réactiver</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyActionId === `susp_${u.uid}`}
                            onClick={() => {
                              setUserSuspendTarget(u);
                              setUserSuspendReason('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 rounded-lg cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Suspendre</span>
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Historique dédié des opérations */}
      {tab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(ACTIVITY_TYPE_LABELS) as Array<'all' | ActivityTargetType>).map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setHistoryTypeFilter(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border cursor-pointer ${
                      historyTypeFilter === key
                        ? 'border-[#0A2540] dark:border-teal-500 bg-[#0A2540] dark:bg-teal-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {ACTIVITY_TYPE_LABELS[key]}
                  </button>
                ),
              )}
            </div>

            <div className="relative w-full lg:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Filtrer acteur, action, cible..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
            {filteredActivities.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                Aucune opération enregistrée pour ce filtre.
              </div>
            ) : (
              filteredActivities.map((act) => (
                <div
                  key={act.id}
                  className="px-6 py-3.5 flex items-start justify-between gap-4 text-xs"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <History className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-slate-800 dark:text-slate-200">
                        <strong>{act.actorName}</strong> · {act.action}
                      </p>
                      {act.targetTitle && (
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {act.targetTitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {ACTIVITY_TYPE_LABELS[act.targetType] || act.targetType}
                    </span>
                    <p className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                      {formatTimestamp(act.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Paramètres de la plateforme */}
      {tab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
              Paramètres de la plateforme (tarifs & numéros locaux)
            </h3>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Pass visite (FCFA)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={visitPassPrice}
                    onChange={(e) => setVisitPassPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Annonce Top (FCFA)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={topListingPrice}
                    onChange={(e) => setTopListingPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Durée Annonce Top (jours)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={90}
                    value={topListingDurationDays}
                    onChange={(e) => setTopListingDurationDays(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    WhatsApp Assistance 1
                  </label>
                  <input
                    type="text"
                    required
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+2290157382961"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    WhatsApp Assistance 2
                  </label>
                  <input
                    type="text"
                    value={whatsappSecondaryNumber}
                    onChange={(e) => setWhatsappSecondaryNumber(e.target.value)}
                    placeholder="+22776688125"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Lien officiel du groupe WhatsApp GidaColocs (adhésion directe et confirmation de location)
                </label>
                <div className="relative">
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="url"
                    maxLength={300}
                    value={whatsappGroupUrl}
                    onChange={(e) => setWhatsappGroupUrl(e.target.value)}
                    placeholder={OFFICIAL_WHATSAPP_GROUP_URL}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Numéro MTN Mobile Money
                  </label>
                  <input
                    type="text"
                    required
                    value={mtnNumber}
                    onChange={(e) => setMtnNumber(e.target.value)}
                    placeholder="+2290157382961"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Numéro Airtel Money
                  </label>
                  <input
                    type="text"
                    required
                    value={airtelNumber}
                    onChange={(e) => setAirtelNumber(e.target.value)}
                    placeholder="+22776688125"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Compte / Numéro NITA (MyNITA)
                  </label>
                  <input
                    type="text"
                    required
                    value={nitaAccount}
                    onChange={(e) => setNitaAccount(e.target.value)}
                    placeholder="+22776688125"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Numéro Moov Money
                  </label>
                  <input
                    type="text"
                    required
                    value={moovNumber}
                    onChange={(e) => setMoovNumber(e.target.value)}
                    placeholder="+22776688125"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <span
                  className={`text-xs ${
                    configError
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {configError ?? configMessage ?? ''}
                </span>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 rounded-lg cursor-pointer shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingConfig ? 'Enregistrement...' : 'Sauvegarder la config'}</span>
                </button>
              </div>
            </form>
          </section>

          <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Dernières opérations
              </h3>
              <button
                type="button"
                onClick={() => setTab('history')}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
              >
                Tout voir
              </button>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[380px] overflow-y-auto">
              {activities.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">Aucune activité enregistrée.</p>
              ) : (
                activities.slice(0, 12).map((act) => (
                  <div
                    key={act.id}
                    className="px-6 py-3 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="text-slate-800 dark:text-slate-200">
                        <strong>{act.actorName}</strong> · {act.action}
                      </p>
                      {act.targetTitle && (
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                          {act.targetTitle}
                        </p>
                      )}
                    </div>
                    <span className="text-slate-400 tabular-nums shrink-0">
                      {formatTimestamp(act.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
      {/* Modale de motif de refus / échec / remboursement */}
      {orderActionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                {orderActionTarget.nextStatus === 'refunded'
                  ? 'Rembourser ce paiement'
                  : orderActionTarget.nextStatus === 'failed'
                    ? 'Marquer la transaction échouée'
                    : 'Refuser ce paiement'}
              </h4>
              <button
                type="button"
                onClick={() => setOrderActionTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const { order, nextStatus } = orderActionTarget;
                const reason = orderActionReason.trim();
                if (!reason) return;
                void runAdminAction(
                  order.id,
                  async () => {
                    await adminRejectServiceOrder(order, reason, user, adminName, nextStatus);
                    setOrderActionTarget(null);
                    setOrderActionReason('');
                  },
                  nextStatus === 'refunded'
                    ? 'Paiement remboursé.'
                    : nextStatus === 'failed'
                      ? 'Paiement marqué échoué.'
                      : 'Paiement refusé.',
                );
              }}
              className="p-5 space-y-4"
            >
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p>
                  Client : <strong>{orderActionTarget.order.userName}</strong> (
                  {orderActionTarget.order.userPhone})
                </p>
                <p className="tabular-nums">
                  {ORDER_TYPE_LABELS[orderActionTarget.order.orderType]} ·{' '}
                  {formatFcfa(orderActionTarget.order.amountFcfa)} · Réf :{' '}
                  <strong>{orderActionTarget.order.transactionRef}</strong>
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Motif détaillé (visible par l’utilisateur et archivé)
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={300}
                  value={orderActionReason}
                  onChange={(e) => setOrderActionReason(e.target.value)}
                  placeholder={
                    orderActionTarget.nextStatus === 'refunded'
                      ? 'Ex : Remboursement effectué suite à indisponibilité du logement...'
                      : orderActionTarget.nextStatus === 'failed'
                        ? 'Ex : Transaction expirée ou annulée sur le réseau...'
                        : 'Ex : Référence introuvable ou montant différent de celui attendu...'
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOrderActionTarget(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!orderActionReason.trim() || busyActionId === orderActionTarget.order.id}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  Confirmer la décision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale d'inspection de preuve & historique de vérification */}
      {previewProofOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Preuve & Suivi — {ORDER_TYPE_LABELS[previewProofOrder.orderType]}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  Réf : {previewProofOrder.transactionRef} · Statut :{' '}
                  {ORDER_STATUS_LABELS[previewProofOrder.status]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProofOrder(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Client / Payeur</span>
                  <strong className="text-slate-900 dark:text-white">
                    {previewProofOrder.userName} ({previewProofOrder.userPhone})
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Montant & Canal</span>
                  <strong className="text-slate-900 dark:text-white tabular-nums">
                    {formatFcfa(previewProofOrder.amountFcfa)} · {previewProofOrder.paymentMethod}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Bénéficiaire</span>
                  <strong className="text-slate-900 dark:text-white tabular-nums">
                    {previewProofOrder.beneficiaryPhone || 'Non spécifié'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Reçu officiel</span>
                  <strong className="text-slate-900 dark:text-white tabular-nums">
                    {previewProofOrder.receiptNumber || 'En attente de validation'}
                  </strong>
                </div>
              </div>

              {previewProofOrder.proofImage ? (
                <div className="space-y-1.5">
                  <p className="font-medium text-slate-700 dark:text-slate-200">
                    Capture d’écran fournie :
                  </p>
                  <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950">
                    <img
                      src={previewProofOrder.proofImage}
                      alt={`Preuve ${previewProofOrder.transactionRef}`}
                      className="w-full max-h-80 object-contain mx-auto"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-center">
                  Aucune capture d’écran jointe (vérification par référence transactionnelle uniquement).
                </div>
              )}

              {previewProofOrder.verificationHistory &&
                previewProofOrder.verificationHistory.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-slate-700 dark:text-slate-200">
                      Historique de vérification :
                    </p>
                    <div className="space-y-1.5">
                      {previewProofOrder.verificationHistory.map((entry, idx) => (
                        <div
                          key={`${entry.atIso}-${idx}`}
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
                        >
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {ORDER_STATUS_LABELS[entry.status]}
                            </span>{' '}
                            · <span className="text-slate-600 dark:text-slate-300">{entry.note}</span>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Par {entry.actorName}
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                            {new Date(entry.atIso).toLocaleString('fr-FR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {previewProofOrder.status === 'verified' && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => downloadPaymentReceipt(previewProofOrder)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Télécharger le reçu</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale d'inspection complète d'une annonce, coordonnées privées du déposant & historique */}
      {inspectListing && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Inspection — {inspectListing.title}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                  {inspectListing.neighborhood} · {PROPERTY_TYPE_LABELS[inspectListing.propertyType]} ·{' '}
                  {formatFcfa(inspectListing.priceFcfa)} / mois · {LISTING_STATUS_LABELS[inspectListing.status]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectListing(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer shrink-0"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs">
              {/* Galerie photos cliquables (zoom plein écran) */}
              {inspectListing.photos.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                    <span>Photos du logement ({inspectListing.photos.length})</span>
                    <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                      Cliquez sur une photo pour l’agrandir
                    </span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {inspectListing.photos.map((src, idx) => (
                      <button
                        type="button"
                        key={`${inspectListing.id}-photo-${idx}`}
                        onClick={() => setInspectLightboxIdx(idx)}
                        className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 cursor-pointer"
                      >
                        <img
                          src={src}
                          alt={`Photo ${idx + 1} - ${inspectListing.title}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-950/75 text-white text-[10px] font-medium">
                          <ZoomIn className="w-3 h-3" />
                          <span>Zoom</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400">
                  Aucune photo jointe à cette annonce.
                </div>
              )}

              {/* Vidéos jointes & lecteur */}
              {inspectListing.videos && inspectListing.videos.length > 0 && (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>Vidéos jointes ({inspectListing.videos.length})</span>
                  </p>
                  <div className="space-y-2.5">
                    {inspectListing.videos.map((v) => {
                      if (v.sourceType === 'clip' && v.clipId) {
                        const clipData = inspectVideoCache[v.clipId];
                        return (
                          <div
                            key={v.id}
                            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {v.title} ({v.durationSec}s)
                              </span>
                              {!clipData && (
                                <button
                                  type="button"
                                  disabled={loadingInspectVideoId === v.clipId}
                                  onClick={() =>
                                    void handleLoadInspectVideoClip(inspectListing.id, v.clipId)
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-[#0A2540] dark:bg-teal-600 rounded cursor-pointer"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>
                                    {loadingInspectVideoId === v.clipId
                                      ? 'Chargement...'
                                      : 'Lire la vidéo'}
                                  </span>
                                </button>
                              )}
                            </div>
                            {clipData && (
                              <video
                                src={clipData}
                                controls
                                className="w-full max-h-60 rounded bg-black"
                              />
                            )}
                          </div>
                        );
                      }

                      const parsed = parseVideoEmbed(v.url);
                      return (
                        <div
                          key={v.id}
                          className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                              {v.title}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{v.url}</p>
                          </div>
                          <a
                            href={
                              parsed.kind === 'external'
                                ? parsed.externalUrl
                                : parsed.kind === 'video'
                                  ? parsed.src
                                  : v.url
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded shrink-0"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Ouvrir ({parsed.providerLabel})</span>
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dossier privé du déposant (Strictement confidentiel - Admin & Propriétaire) */}
              <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/50 dark:bg-teal-950/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    <h5 className="text-xs font-bold text-[#0A2540] dark:text-white uppercase tracking-wide">
                      Coordonnées privées & justificatif du déposant
                    </h5>
                  </div>
                  <span className="text-[11px] text-teal-700 dark:text-teal-300 font-medium">
                    Jamais affichées publiquement
                  </span>
                </div>

                {loadingVerification ? (
                  <p className="text-slate-500 dark:text-slate-400">
                    Chargement du dossier confidentiel du déposant...
                  </p>
                ) : inspectVerification ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Nom et prénom du déposant
                        </span>
                        <strong className="text-slate-900 dark:text-white">
                          {inspectVerification.contactName}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">Statut déclaré</span>
                        <strong className="text-slate-900 dark:text-white">
                          {DEPOSITOR_STATUS_LABELS[inspectVerification.depositorStatus] ||
                            inspectVerification.depositorStatus}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Téléphone principal
                        </span>
                        <strong className="text-slate-900 dark:text-white tabular-nums">
                          {inspectVerification.contactPhone}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">WhatsApp</span>
                        <strong className="text-slate-900 dark:text-white tabular-nums">
                          {inspectVerification.contactWhatsapp || inspectVerification.contactPhone}
                        </strong>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Quartier / Adresse du déposant
                        </span>
                        <strong className="text-slate-900 dark:text-white">
                          {inspectVerification.depositorAddress}
                        </strong>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Justificatif / explication d’autorisation
                        </span>
                        <p className="text-slate-800 dark:text-slate-200 mt-0.5 leading-relaxed">
                          {inspectVerification.authorizationNote || 'Non renseigné'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={`tel:${inspectVerification.contactPhone.replace(/[^0-9+]/g, '')}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 rounded-lg"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Appeler ({inspectVerification.contactPhone})</span>
                      </a>
                      <a
                        href={buildWhatsAppUrl(
                          inspectVerification.contactWhatsapp || inspectVerification.contactPhone,
                          `Bonjour ${inspectVerification.contactName}, ici l’administration GidaColocs concernant votre annonce « ${inspectListing.title} » (${inspectListing.neighborhood}). Pouvons-nous vérifier les informations ?`,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-amber-700 dark:text-amber-300">
                    Aucun dossier privé attaché à cette annonce (annonce antérieure ou supprimée).
                  </p>
                )}
              </div>

              {/* Caractéristiques détaillées du logement */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Déposant (public)</span>
                  <strong className="text-slate-900 dark:text-white">{inspectListing.ownerName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">
                    Nombre de pièces / Places
                  </span>
                  <strong className="text-slate-900 dark:text-white tabular-nums">
                    {inspectListing.roomsCount || 1} pièce(s) · {inspectListing.availableSpots} place(s)
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Disponibilité</span>
                  <strong className="text-slate-900 dark:text-white">
                    {inspectListing.availability || 'Disponible immédiatement'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Localisation / Repère</span>
                  <strong className="text-slate-900 dark:text-white inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                    <span>{inspectListing.locationDetails || inspectListing.neighborhood}</span>
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Caution & Surface</span>
                  <strong className="text-slate-900 dark:text-white tabular-nums">
                    {inspectListing.depositMonths} mois ·{' '}
                    {inspectListing.surfaceSqm ? `${inspectListing.surfaceSqm} m²` : 'Surface n.p.'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Douche & WC</span>
                  <strong className="text-slate-900 dark:text-white">
                    {inspectListing.bathroomType ? BATHROOM_LABELS[inspectListing.bathroomType] : '—'} ·{' '}
                    {inspectListing.toiletType ? TOILET_LABELS[inspectListing.toiletType] : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Ameublement & Eau/Élec</span>
                  <strong className="text-slate-900 dark:text-white">
                    {inspectListing.furnished ? FURNISHED_LABELS[inspectListing.furnished] : '—'} ·{' '}
                    {inspectListing.waterElectricity
                      ? UTILITY_LABELS[inspectListing.waterElectricity]
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Public souhaité</span>
                  <strong className="text-slate-900 dark:text-white">
                    {inspectListing.roommatePreference
                      ? ROOMMATE_PREFERENCE_LABELS[inspectListing.roommatePreference]
                      : 'Mixte'}
                  </strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="font-semibold text-slate-900 dark:text-white">Description</p>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {inspectListing.description || 'Aucune description fournie.'}
                </p>
              </div>

              {inspectListing.houseRules && (
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-white">Règles & Conditions</p>
                  <p className="text-slate-600 dark:text-slate-300">{inspectListing.houseRules}</p>
                </div>
              )}

              {inspectListing.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {inspectListing.amenities.map((a) => (
                    <span
                      key={a}
                      className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}

              {inspectListing.validatedByName && inspectListing.validatedAtIso && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                  Dernière décision enregistrée par <strong>{inspectListing.validatedByName}</strong>
                  {inspectListing.validatedByEmail ? ` (${inspectListing.validatedByEmail})` : ''} le{' '}
                  {new Date(inspectListing.validatedAtIso).toLocaleString('fr-FR')}
                </div>
              )}

              {inspectListing.moderationReason && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300">
                  <strong>Motif actuel :</strong> {inspectListing.moderationReason}
                </div>
              )}

              {inspectListing.moderationHistory && inspectListing.moderationHistory.length > 0 && (
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    Historique des validations & décisions ({inspectListing.moderationHistory.length})
                  </p>
                  <div className="space-y-1.5">
                    {inspectListing.moderationHistory.map((entry, idx) => (
                      <div
                        key={`${entry.atIso}-${idx}`}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
                      >
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {LISTING_STATUS_LABELS[entry.status] || entry.status}
                          </span>{' '}
                          · <span className="text-slate-600 dark:text-slate-300">{entry.reason}</span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Par {entry.actorName}
                            {entry.actorEmail ? ` (${entry.actorEmail})` : ''}
                          </p>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          {new Date(entry.atIso).toLocaleString('fr-FR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions complètes depuis l'inspection */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const target = inspectListing;
                    setInspectListing(null);
                    onEditListing(target);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Modifier</span>
                </button>

                {inspectListing.status === 'pending' && (
                  <button
                    type="button"
                    disabled={busyActionId === inspectListing.id}
                    onClick={() =>
                      void runAdminAction(
                        inspectListing.id,
                        () =>
                          adminModerateListing(
                            inspectListing,
                            {
                              status: 'in_review',
                              reason: 'En cours de vérification par l’administrateur',
                            },
                            user,
                            adminName,
                          ),
                        'Annonce passée en cours de vérification.',
                      )
                    }
                    className="px-3 py-2 text-xs font-medium text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg cursor-pointer"
                  >
                    Passer en vérification
                  </button>
                )}

                {inspectListing.status !== 'needs_correction' &&
                  inspectListing.status !== 'rented' && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = inspectListing;
                        setInspectListing(null);
                        setListingModerationTarget({
                          listing: target,
                          nextStatus: 'needs_correction',
                        });
                        setListingModerationReason('');
                      }}
                      className="px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg cursor-pointer"
                    >
                      Demander corrections
                    </button>
                  )}

                {inspectListing.status !== 'published' && (
                  <button
                    type="button"
                    disabled={busyActionId === inspectListing.id}
                    onClick={() =>
                      void runAdminAction(
                        inspectListing.id,
                        async () => {
                          await adminModerateListing(
                            inspectListing,
                            {
                              status: 'published',
                              isVerifiedQolock: true,
                              reason: 'Logement inspecté et approuvé',
                            },
                            user,
                            adminName,
                          );
                          setInspectListing(null);
                        },
                        'Annonce approuvée et publiée.',
                      )
                    }
                    className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approuver & Publier</span>
                  </button>
                )}

                {(inspectListing.status === 'pending' ||
                  inspectListing.status === 'in_review' ||
                  inspectListing.status === 'needs_correction') && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = inspectListing;
                      setInspectListing(null);
                      setListingModerationTarget({ listing: target, nextStatus: 'rejected' });
                      setListingModerationReason('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Refuser avec motif</span>
                  </button>
                )}

                {(inspectListing.status === 'published' ||
                  inspectListing.status === 'reserved' ||
                  inspectListing.status === 'rented') && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = inspectListing;
                      setInspectListing(null);
                      setListingModerationTarget({ listing: target, nextStatus: 'suspended' });
                      setListingModerationReason('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Suspendre</span>
                  </button>
                )}

                {(inspectListing.status === 'published' ||
                  inspectListing.status === 'reserved') && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = inspectListing;
                      setInspectListing(null);
                      openConfirmRentalModal(target);
                    }}
                    className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-white bg-[#0A2540] hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700 rounded-lg cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Confirmer une location</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visionneuse plein écran des photos d'inspection */}
      {inspectListing && inspectLightboxIdx !== null && inspectListing.photos[inspectLightboxIdx] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Agrandissement photo logement"
          className="fixed inset-0 z-[60] bg-slate-950/95 flex flex-col items-center justify-center p-4"
        >
          <div className="w-full max-w-5xl flex items-center justify-between text-white text-xs mb-3">
            <span className="font-semibold truncate">
              {inspectListing.title} — Photo {inspectLightboxIdx + 1} / {inspectListing.photos.length}
            </span>
            <button
              type="button"
              onClick={() => setInspectLightboxIdx(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Fermer</span>
            </button>
          </div>
          <div className="relative w-full max-w-5xl flex-1 flex items-center justify-center min-h-0">
            {inspectListing.photos.length > 1 && (
              <button
                type="button"
                aria-label="Photo précédente"
                onClick={() =>
                  setInspectLightboxIdx(
                    (inspectLightboxIdx - 1 + inspectListing.photos.length) %
                      inspectListing.photos.length,
                  )
                }
                className="absolute left-2 sm:left-4 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <img
              src={inspectListing.photos[inspectLightboxIdx]}
              alt={`Agrandissement ${inspectLightboxIdx + 1}`}
              className="max-h-[82vh] max-w-full object-contain rounded-lg"
            />
            {inspectListing.photos.length > 1 && (
              <button
                type="button"
                aria-label="Photo suivante"
                onClick={() =>
                  setInspectLightboxIdx((inspectLightboxIdx + 1) % inspectListing.photos.length)
                }
                className="absolute right-2 sm:right-4 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modale de motif (Demande de corrections, Refus ou Suspension) */}
      {listingModerationTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                {listingModerationTarget.nextStatus === 'needs_correction'
                  ? 'Demander des corrections'
                  : listingModerationTarget.nextStatus === 'suspended'
                    ? 'Suspendre cette annonce'
                    : 'Refuser cette annonce'}
              </h4>
              <button
                type="button"
                onClick={() => setListingModerationTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const { listing, nextStatus } = listingModerationTarget;
                const reason = listingModerationReason.trim();
                if (!reason) return;
                void runAdminAction(
                  listing.id,
                  async () => {
                    await adminModerateListing(
                      listing,
                      {
                        status: nextStatus,
                        reason,
                        isVerifiedQolock:
                          nextStatus === 'rejected' || nextStatus === 'needs_correction'
                            ? false
                            : listing.isVerifiedQolock,
                        isTop: false,
                        topRequested: false,
                      },
                      user,
                      adminName,
                    );
                    setListingModerationTarget(null);
                    setListingModerationReason('');
                  },
                  nextStatus === 'needs_correction'
                    ? 'Demande de corrections envoyée au déposant.'
                    : nextStatus === 'suspended'
                      ? 'Annonce suspendue et propriétaire notifié.'
                      : 'Annonce refusée et propriétaire notifié.',
                );
              }}
              className="p-5 space-y-4"
            >
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {listingModerationTarget.listing.title}
                </p>
                <p>
                  {listingModerationTarget.listing.neighborhood} · Par{' '}
                  {listingModerationTarget.listing.ownerName}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Motif détaillé (transmis au déposant et archivé)
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={300}
                  value={listingModerationReason}
                  onChange={(e) => setListingModerationReason(e.target.value)}
                  placeholder={
                    listingModerationTarget.nextStatus === 'needs_correction'
                      ? 'Ex : Ajoutez une photo de la douche, précisez le repère ou vérifiez votre justificatif...'
                      : listingModerationTarget.nextStatus === 'suspended'
                        ? 'Ex : Signalements répétés, logement déjà occupé ou informations à mettre à jour...'
                        : 'Ex : Photos non réelles, informations fausses ou logement non conforme...'
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setListingModerationTarget(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={
                    !listingModerationReason.trim() ||
                    busyActionId === listingModerationTarget.listing.id
                  }
                  className={`px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 rounded-lg cursor-pointer ${
                    listingModerationTarget.nextStatus === 'needs_correction'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  Confirmer la décision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale de motif obligatoire pour profils colocataires, demandes colocation, commentaires et avis */}
      {contentModerationTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                {contentModerationTarget.decision === 'needs_correction'
                  ? 'Demander une correction'
                  : 'Refuser cette publication'}
              </h4>
              <button
                type="button"
                onClick={() => setContentModerationTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const target = contentModerationTarget;
                const reason = contentModerationReason.trim();
                if (!reason) return;

                const actionKey =
                  target.kind === 'coloc_profile'
                    ? `mod_cp_${target.item.id}`
                    : target.kind === 'coloc_interest'
                      ? `mod_ci_${target.item.listingId || 'none'}_${target.item.id}`
                      : target.kind === 'coloc_message'
                        ? `mod_msg_${target.item.id}`
                        : `mod_rev_${target.item.id}`;

                void runAdminAction(
                  actionKey,
                  async () => {
                    if (target.kind === 'coloc_profile') {
                      await adminModerateColocProfile(
                        target.item,
                        target.decision,
                        reason,
                        user,
                        adminName,
                      );
                    } else if (target.kind === 'coloc_interest') {
                      await adminModerateColocInterest(
                        target.item,
                        target.decision,
                        reason,
                        user,
                        adminName,
                      );
                    } else if (target.kind === 'coloc_message') {
                      await adminModerateColocMessage(
                        target.item,
                        target.decision,
                        reason,
                        user,
                        adminName,
                      );
                    } else {
                      await adminModerateListingReview(
                        target.item,
                        target.decision,
                        reason,
                        user,
                        adminName,
                      );
                    }
                    setContentModerationTarget(null);
                    setContentModerationReason('');
                  },
                  target.decision === 'needs_correction'
                    ? 'Demande de correction envoyée à l’auteur.'
                    : 'Publication refusée et auteur notifié.',
                );
              }}
              className="p-5 space-y-4"
            >
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {contentModerationTarget.kind === 'coloc_profile'
                    ? `Profil colocataire — ${contentModerationTarget.item.authorName} (${contentModerationTarget.item.targetNeighborhood})`
                    : contentModerationTarget.kind === 'coloc_interest'
                      ? `Demande de colocation — ${contentModerationTarget.item.userName}`
                      : contentModerationTarget.kind === 'coloc_message'
                        ? `Commentaire — ${contentModerationTarget.item.authorName}`
                        : `Avis public — ${contentModerationTarget.item.authorName} (${contentModerationTarget.item.listingTitle})`}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  La publication reste invisible publiquement tant qu’elle n’est pas approuvée.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Motif obligatoire (notifié à l’utilisateur et archivé)
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={300}
                  value={contentModerationReason}
                  onChange={(e) => setContentModerationReason(e.target.value)}
                  placeholder={
                    contentModerationTarget.decision === 'needs_correction'
                      ? 'Ex : Précisez votre quartier ou reformulez votre message sans numéro personnel...'
                      : 'Ex : Contenu non conforme aux règles de GidaColocs...'
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setContentModerationTarget(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!contentModerationReason.trim() || Boolean(busyActionId)}
                  className={`px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 rounded-lg cursor-pointer ${
                    contentModerationTarget.decision === 'needs_correction'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  Confirmer la décision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale de confirmation officielle de location (débloque lien communautaire WhatsApp au locataire) */}
      {confirmRentalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Confirmer une location (Logement pris)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmRentalTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const pickedUser = allUsers.find((u) => u.uid === rentalTenantId);
                if (!pickedUser) return;
                const targetListing = confirmRentalTarget;
                const welcomeText = rentalWelcomeMessage.trim();
                void runAdminAction(
                  `rental_${targetListing.id}`,
                  async () => {
                    await confirmRentalForTenant(
                      targetListing,
                      {
                        tenantId: pickedUser.uid,
                        tenantName: pickedUser.displayName,
                        tenantPhone: rentalTenantPhone.trim(),
                        welcomeMessage: welcomeText,
                      },
                      user,
                      adminName,
                    );
                    setConfirmRentalTarget(null);
                    setConfirmedRentalResult({
                      listingTitle: targetListing.title,
                      neighborhood: targetListing.neighborhood,
                      tenantName: pickedUser.displayName,
                      welcomeMessage:
                        welcomeText ||
                        `Félicitations ${pickedUser.displayName} ! Votre location pour « ${targetListing.title} » (${targetListing.neighborhood}) est officiellement confirmée sur GidaColocs.`,
                      whatsappGroupUrl: officialCommunityUrl,
                    });
                  },
                  `Location confirmée avec ${pickedUser.displayName}. Le lien communautaire WhatsApp est désormais activé dans son espace.`,
                );
              }}
              className="p-5 space-y-4 text-xs"
            >
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {confirmRentalTarget.title}
                </p>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  {confirmRentalTarget.neighborhood} · {formatFcfa(confirmRentalTarget.priceFcfa)} / mois · Par{' '}
                  {confirmRentalTarget.ownerName}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block font-medium text-slate-700 dark:text-slate-200">
                  Rechercher et sélectionner le locataire concerné *
                </label>
                <input
                  type="text"
                  value={rentalTenantSearch}
                  onChange={(e) => setRentalTenantSearch(e.target.value)}
                  placeholder="Filtrer par nom ou quartier..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
                <select
                  required
                  value={rentalTenantId}
                  onChange={(e) => {
                    setRentalTenantId(e.target.value);
                    const info = userContacts[e.target.value];
                    if (info?.phone) setRentalTenantPhone(info.phone);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="">-- Choisir le compte du locataire --</option>
                  {allUsers
                    .filter((u) => {
                      const q = rentalTenantSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        u.displayName.toLowerCase().includes(q) ||
                        (u.neighborhood || '').toLowerCase().includes(q)
                      );
                    })
                    .map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName} ({ACCOUNT_TYPE_LABELS[u.accountType]}
                        {u.neighborhood ? ` · ${u.neighborhood}` : ''})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Téléphone du locataire (facultatif)
                </label>
                <input
                  type="tel"
                  value={rentalTenantPhone}
                  onChange={(e) => setRentalTenantPhone(e.target.value)}
                  placeholder="Ex : +227 96 00 00 00"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Message de bienvenue transmis au locataire
                </label>
                <textarea
                  rows={3}
                  maxLength={450}
                  value={rentalWelcomeMessage}
                  onChange={(e) => setRentalWelcomeMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 leading-relaxed">
                Dès confirmation, le logement passe au statut « Louée / Occupée » et le locataire
                sélectionné voit s’afficher le message de bienvenue et le bouton officiel « REJOINDRE
                NOTRE COMMUNAUTÉ WHATSAPP ».
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmRentalTarget(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!rentalTenantId || busyActionId === `rental_${confirmRentalTarget.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirmer la location</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale récapitulative post-confirmation de location */}
      {confirmedRentalResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Location officiellement confirmée
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmedRentalResult(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {confirmedRentalResult.listingTitle} ({confirmedRentalResult.neighborhood})
                </p>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  Locataire confirmé : <strong>{confirmedRentalResult.tenantName}</strong>
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 space-y-2">
                <p className="font-semibold">Message de bienvenue activé :</p>
                <p className="leading-relaxed">{confirmedRentalResult.welcomeMessage}</p>
              </div>

              <a
                href={confirmedRentalResult.whatsappGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <MessageCircle className="w-4 h-4" />
                <span>REJOINDRE NOTRE COMMUNAUTÉ WHATSAPP</span>
              </a>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmedRentalResult(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale de suspension d'un compte utilisateur */}
      {userSuspendTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                Suspendre ce compte utilisateur
              </h4>
              <button
                type="button"
                onClick={() => setUserSuspendTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const target = userSuspendTarget;
                const reason = userSuspendReason.trim();
                if (!reason) return;
                void runAdminAction(
                  `susp_${target.uid}`,
                  async () => {
                    await adminSetUserAccountStatus(target, 'suspended', reason, user, adminName);
                    setUserSuspendTarget(null);
                    setUserSuspendReason('');
                  },
                  `Compte de ${target.displayName} suspendu.`,
                );
              }}
              className="p-5 space-y-4"
            >
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p>
                  Compte : <strong>{userSuspendTarget.displayName}</strong> (
                  {ACCOUNT_TYPE_LABELS[userSuspendTarget.accountType]})
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  L’utilisateur ne pourra plus publier d’annonces, commander de Pass Visite ni poster de messages jusqu’à réactivation.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  Motif de la suspension
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={300}
                  value={userSuspendReason}
                  onChange={(e) => setUserSuspendReason(e.target.value)}
                  placeholder="Ex : Fausses annonces répétées, comportement abusif ou non-respect des règles..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserSuspendTarget(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={
                    !userSuspendReason.trim() || busyActionId === `susp_${userSuspendTarget.uid}`
                  }
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  Suspendre le compte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
