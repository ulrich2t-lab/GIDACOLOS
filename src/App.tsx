import { useEffect, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  MessageCircle,
  Moon,
  Phone,
  PlusCircle,
  Shield,
  Sun,
  User,
  Users,
  X,
} from 'lucide-react';
import { db } from './lib/firebase';
import { OperationType, reportFirestoreError } from './lib/firestoreError';
import {
  DEFAULT_PLATFORM_CONFIG,
  OFFICIAL_WHATSAPP_GROUP_URL,
} from './lib/constants';
import { buildWhatsAppUrl, formatFcfa } from './lib/formatters';
import { AuthProvider, isSyntheticWhatsAppEmail, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Avatar } from './components/Avatar';
import { BrandLogo } from './components/BrandLogo';
import { HomeExploreView } from './components/HomeExploreView';
import { ColocationSpaceView } from './components/ColocationSpaceView';
import { PublishListingView } from './components/PublishListingView';
import { UserSpaceView } from './components/UserSpaceView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { ListingDetailModal } from './components/ListingDetailModal';
import { AuthModal } from './components/AuthModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import type {
  AdminAlert,
  ColocInterest,
  ColocMessage,
  ColocProfile,
  ColocReportItem,
  Listing,
  ListingReview,
  PassAccess,
  PlatformActivity,
  PlatformConfig,
  RentalConfirmation,
  ReportItem,
  ServiceOrder,
  UserNotification,
  UserProfile,
} from './types/platform';

type ViewTab = 'home' | 'coloc' | 'publish' | 'account' | 'admin';

function sortByCreatedAtDesc<T extends { createdAt?: Timestamp }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const tA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
    const tB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
    return tB - tA;
  });
}

function GidaColocsPlatform() {
  const {
    user,
    profile,
    isAdmin,
    adminUidMissingDoc,
    isSuspended,
    authReady,
    authError,
    authModalOpen,
    theme,
    toggleTheme,
    openAuthModal,
    clearAuthError,
    signInWithGoogleSelectAccount,
    signInAdminWithPhonePassword,
    signOutUser,
  } = useAuth();

  const [activeView, setActiveView] = useState<ViewTab>('home');
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedConfirmation, setSelectedConfirmation] = useState<RentalConfirmation | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Admin portal login form state (credentials verified via Firebase Auth + /admins/{uid}; no password or phone prefilled)
  const [adminPhone, setAdminPhone] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminSigningIn, setAdminSigningIn] = useState(false);
  const [adminLoginLocalError, setAdminLoginLocalError] = useState<string | null>(null);

  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  const [publicListings, setPublicListings] = useState<Listing[]>([]);
  const [colocProfiles, setColocProfiles] = useState<ColocProfile[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(true);

  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [myListingsLoaded, setMyListingsLoaded] = useState(false);
  const [myColocProfiles, setMyColocProfiles] = useState<ColocProfile[]>([]);
  const [myOrders, setMyOrders] = useState<ServiceOrder[]>([]);
  const [passAccessList, setPassAccessList] = useState<PassAccess[]>([]);
  const [myNotifications, setMyNotifications] = useState<UserNotification[]>([]);
  const [myRentalConfirmations, setMyRentalConfirmations] = useState<RentalConfirmation[]>([]);

  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [adminListingsLoaded, setAdminListingsLoaded] = useState(false);
  const [allOrders, setAllOrders] = useState<ServiceOrder[]>([]);
  const [allReports, setAllReports] = useState<ReportItem[]>([]);
  const [allColocProfiles, setAllColocProfiles] = useState<ColocProfile[]>([]);
  const [allColocInterests, setAllColocInterests] = useState<ColocInterest[]>([]);
  const [allColocMessages, setAllColocMessages] = useState<ColocMessage[]>([]);
  const [allListingReviews, setAllListingReviews] = useState<ListingReview[]>([]);
  const [allColocReports, setAllColocReports] = useState<ColocReportItem[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [activities, setActivities] = useState<PlatformActivity[]>([]);
  const [adminAlerts, setAdminAlerts] = useState<AdminAlert[]>([]);
  const [allRentalConfirmations, setAllRentalConfirmations] = useState<RentalConfirmation[]>([]);


  // 1. Platform public config (tariffs, WhatsApp & local payment numbers)
  useEffect(() => {
    const LEGACY_PLACEHOLDERS = new Set([
      '22790000000',
      '96 00 00 00',
      '90 00 00 00',
    ]);
    const pickActiveValue = (value: string | undefined, fallback: string) => {
      const trimmed = (value || '').trim();
      return !trimmed || LEGACY_PLACEHOLDERS.has(trimmed) ? fallback : trimmed;
    };

    const configRef = doc(db, 'platformConfig', 'settings');
    const unsubscribe = onSnapshot(
      configRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<PlatformConfig>;
          const isLegacySwappedTariff =
            typeof data.topListingDurationDays !== 'number' &&
            data.visitPassPrice === 1000 &&
            data.topListingPrice === 2000;
          const normalizeLegacyPhone = (raw: string | undefined, target: string) => {
            const val = pickActiveValue(raw, target);
            const digitsOnly = target.replace(/^\+/, '');
            return val === digitsOnly ? target : val;
          };
          setConfig({
            visitPassPrice: isLegacySwappedTariff
              ? DEFAULT_PLATFORM_CONFIG.visitPassPrice
              : typeof data.visitPassPrice === 'number'
                ? data.visitPassPrice
                : DEFAULT_PLATFORM_CONFIG.visitPassPrice,
            topListingPrice: isLegacySwappedTariff
              ? DEFAULT_PLATFORM_CONFIG.topListingPrice
              : typeof data.topListingPrice === 'number'
                ? data.topListingPrice
                : DEFAULT_PLATFORM_CONFIG.topListingPrice,
            topListingDurationDays:
              typeof data.topListingDurationDays === 'number' && data.topListingDurationDays >= 1
                ? data.topListingDurationDays
                : DEFAULT_PLATFORM_CONFIG.topListingDurationDays || 7,
            whatsappNumber: normalizeLegacyPhone(
              data.whatsappNumber,
              DEFAULT_PLATFORM_CONFIG.whatsappNumber,
            ),
            whatsappSecondaryNumber: normalizeLegacyPhone(
              data.whatsappSecondaryNumber,
              DEFAULT_PLATFORM_CONFIG.whatsappSecondaryNumber || '+22776688125',
            ),
            whatsappGroupUrl:
              typeof data.whatsappGroupUrl === 'string' &&
              /^https:\/\//i.test(data.whatsappGroupUrl.trim())
                ? data.whatsappGroupUrl.trim()
                : DEFAULT_PLATFORM_CONFIG.whatsappGroupUrl,
            mtnNumber: normalizeLegacyPhone(
              data.mtnNumber,
              DEFAULT_PLATFORM_CONFIG.mtnNumber || '+2290157382961',
            ),
            moovNumber: normalizeLegacyPhone(data.moovNumber, DEFAULT_PLATFORM_CONFIG.moovNumber),
            airtelNumber: normalizeLegacyPhone(
              data.airtelNumber,
              DEFAULT_PLATFORM_CONFIG.airtelNumber,
            ),
            nitaAccount: normalizeLegacyPhone(data.nitaAccount, DEFAULT_PLATFORM_CONFIG.nitaAccount),
            updatedAt: data.updatedAt,
          });
        } else {
          setConfig(DEFAULT_PLATFORM_CONFIG);
        }
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.GET, 'platformConfig/settings');
        setStatusBanner({ type: 'error', text: msg });
      },
    );
    return () => unsubscribe();
  }, []);

  // 2. Public catalog: published, reserved, and rented listings (readable by visitors without login)
  useEffect(() => {
    const q = query(
      collection(db, 'listings'),
      where('status', 'in', ['published', 'reserved', 'rented']),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Listing, 'id'>),
        }));
        setPublicListings(sortByCreatedAtDesc(items));
        setLoadingPublic(false);
      },
      (err) => {
        setLoadingPublic(false);
        const msg = reportFirestoreError(err, OperationType.LIST, 'listings');
        setStatusBanner({ type: 'error', text: msg });
      },
    );
    return () => unsubscribe();
  }, []);

  // 2b. Public colocation meeting board (only admin-approved & active roommate profiles)
  useEffect(() => {
    const q = query(collection(db, 'colocProfiles'), where('moderationStatus', '==', 'approved'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ColocProfile, 'id'>),
          }))
          .filter((p) => p.status === 'active');
        setColocProfiles(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'colocProfiles');
        setStatusBanner({ type: 'error', text: msg });
      },
    );
    return () => unsubscribe();
  }, []);

  // 3. Authenticated user's own listings, coloc profiles, orders, unlocked Pass Visite access, notifications & rental confirmations
  useEffect(() => {
    if (!authReady || !user) {
      setMyListings([]);
      setMyListingsLoaded(false);
      setMyColocProfiles([]);
      setMyOrders([]);
      setPassAccessList([]);
      setMyNotifications([]);
      setMyRentalConfirmations([]);
      setSelectedConfirmation(null);
      return;
    }

    const unsubListings = onSnapshot(
      query(collection(db, 'listings'), where('ownerId', '==', user.uid)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Listing, 'id'>),
        }));
        setMyListings(sortByCreatedAtDesc(items));
        setMyListingsLoaded(true);
      },
      (err) => {
        setMyListingsLoaded(true);
        const msg = reportFirestoreError(err, OperationType.LIST, 'listings (mine)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubOrders = onSnapshot(
      query(collection(db, 'serviceOrders'), where('userId', '==', user.uid)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ServiceOrder, 'id'>),
        }));
        setMyOrders(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'serviceOrders (mine)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubPasses = onSnapshot(
      query(collection(db, 'passAccess'), where('userId', '==', user.uid)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PassAccess, 'id'>),
        }));
        setPassAccessList(items);
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'passAccess (mine)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.uid)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<UserNotification, 'id'>),
        }));
        setMyNotifications(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'notifications (mine)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubMyConfirmations = onSnapshot(
      query(collection(db, 'rentalConfirmations'), where('tenantId', '==', user.uid)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RentalConfirmation, 'id'>),
        }));
        setMyRentalConfirmations(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'rentalConfirmations (mine)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubMyColocProfiles = onSnapshot(
      query(collection(db, 'colocProfiles'), where('authorId', '==', user.uid)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ColocProfile, 'id'>),
        }));
        setMyColocProfiles(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'colocProfiles (mine)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    return () => {
      unsubListings();
      unsubMyColocProfiles();
      unsubOrders();
      unsubPasses();
      unsubNotifications();
      unsubMyConfirmations();
    };
  }, [authReady, user]);

  // 4. Admin subscriptions (only attached when authenticated as verified Admin)
  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setAllListings([]);
      setAdminListingsLoaded(false);
      setAllOrders([]);
      setAllReports([]);
      setAllColocProfiles([]);
      setAllColocInterests([]);
      setAllColocMessages([]);
      setAllListingReviews([]);
      setAllColocReports([]);
      setAllUsers([]);
      setActivities([]);
      setAdminAlerts([]);
      setAllRentalConfirmations([]);
      return;
    }

    const unsubAllListings = onSnapshot(
      collection(db, 'listings'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Listing, 'id'>),
        }));
        setAllListings(sortByCreatedAtDesc(items));
        setAdminListingsLoaded(true);
      },
      (err) => {
        setAdminListingsLoaded(true);
        const msg = reportFirestoreError(err, OperationType.LIST, 'listings (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllOrders = onSnapshot(
      collection(db, 'serviceOrders'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ServiceOrder, 'id'>),
        }));
        setAllOrders(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'serviceOrders (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllReports = onSnapshot(
      collection(db, 'reports'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReportItem, 'id'>),
        }));
        setAllReports(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'reports (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllColocProfiles = onSnapshot(
      collection(db, 'colocProfiles'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ColocProfile, 'id'>),
        }));
        setAllColocProfiles(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'colocProfiles (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllColocReports = onSnapshot(
      collection(db, 'colocReports'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ColocReportItem, 'id'>),
        }));
        setAllColocReports(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'colocReports (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const items = snap.docs.map((d) => d.data() as UserProfile);
        setAllUsers(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'users (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubActivities = onSnapshot(
      query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limit(150)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PlatformActivity, 'id'>),
        }));
        setActivities(items);
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'activities (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAdminAlerts = onSnapshot(
      query(collection(db, 'adminAlerts'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AdminAlert, 'id'>),
        }));
        setAdminAlerts(items);
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'adminAlerts (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllConfirmations = onSnapshot(
      collection(db, 'rentalConfirmations'),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RentalConfirmation, 'id'>),
        }));
        setAllRentalConfirmations(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'rentalConfirmations (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllColocInterests = onSnapshot(
      collectionGroup(db, 'colocInterests'),
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data() as Omit<ColocInterest, 'id'>;
          return {
            id: d.id,
            ...data,
            listingId: data.listingId || d.ref.parent.parent?.id || '',
          };
        });
        setAllColocInterests(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'colocInterests (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllColocMessages = onSnapshot(
      query(
        collectionGroup(db, 'messages'),
        where('moderationStatus', 'in', ['pending', 'approved', 'rejected', 'needs_correction']),
      ),
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data() as Omit<ColocMessage, 'id'>;
          return {
            id: d.id,
            ...data,
            profileId: data.profileId || d.ref.parent.parent?.id || '',
          };
        });
        setAllColocMessages(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'colocMessages (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    const unsubAllListingReviews = onSnapshot(
      collectionGroup(db, 'reviews'),
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data() as Omit<ListingReview, 'id'>;
          return {
            id: d.id,
            ...data,
            listingId: data.listingId || d.ref.parent.parent?.id || '',
          };
        });
        setAllListingReviews(sortByCreatedAtDesc(items));
      },
      (err) => {
        const msg = reportFirestoreError(err, OperationType.LIST, 'reviews (admin)');
        setStatusBanner({ type: 'error', text: msg });
      },
    );

    return () => {
      unsubAllListings();
      unsubAllOrders();
      unsubAllReports();
      unsubAllColocProfiles();
      unsubAllColocInterests();
      unsubAllColocMessages();
      unsubAllListingReviews();
      unsubAllColocReports();
      unsubAllUsers();
      unsubActivities();
      unsubAdminAlerts();
      unsubAllConfirmations();
    };
  }, [authReady, user, isAdmin]);

  // Keep selectedListing synchronized if updated in Firestore (and close if no longer visible to user)
  useEffect(() => {
    if (!selectedListing) return;
    const pool = isAdmin && allListings.length > 0 ? allListings : [...publicListings, ...myListings];
    const updated = pool.find((l) => l.id === selectedListing.id);
    if (updated && updated !== selectedListing) {
      setSelectedListing(updated);
    } else if (!updated && !loadingPublic) {
      setSelectedListing(null);
    }
  }, [selectedListing, publicListings, myListings, allListings, isAdmin, loadingPublic]);

  // Direct URL deep-linking protection (?listing=<id> or #listing=<id>):
  // Only published, reserved, or rented listings open publicly (plus owner/admin). Pending/rejected/suspended never open publicly.
  useEffect(() => {
    if (typeof window === 'undefined' || loadingPublic || !authReady) return;
    if (user && !myListingsLoaded) return;
    if (isAdmin && !adminListingsLoaded) return;

    const resolveDeepLink = () => {
      const url = new URL(window.location.href);
      const queryId = url.searchParams.get('listing')?.trim() || '';
      const hashMatch = url.hash.match(/^#listing=([a-zA-Z0-9_-]+)$/);
      const targetId = queryId || (hashMatch ? hashMatch[1] : '');
      if (!targetId) return;

      const publicMatch = publicListings.find((l) => l.id === targetId);
      const ownerMatch = user
        ? myListings.find((l) => l.id === targetId && l.ownerId === user.uid)
        : undefined;
      const adminMatch = isAdmin ? allListings.find((l) => l.id === targetId) : undefined;
      const allowed = publicMatch || adminMatch || ownerMatch;

      if (allowed) {
        setSelectedListing(allowed);
      } else {
        setSelectedListing(null);
        url.searchParams.delete('listing');
        if (hashMatch) url.hash = '';
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        setStatusBanner({
          type: 'error',
          text: 'Cette annonce n’est pas disponible publiquement.',
        });
      }
    };

    resolveDeepLink();
    window.addEventListener('popstate', resolveDeepLink);
    window.addEventListener('hashchange', resolveDeepLink);
    return () => {
      window.removeEventListener('popstate', resolveDeepLink);
      window.removeEventListener('hashchange', resolveDeepLink);
    };
  }, [
    loadingPublic,
    authReady,
    user,
    myListingsLoaded,
    isAdmin,
    adminListingsLoaded,
    publicListings,
    myListings,
    allListings,
  ]);

  const handleSelectListing = (item: Listing) => {
    setSelectedListing(item);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('listing', item.id);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  };

  const handleCloseListing = () => {
    setSelectedListing(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('listing') || /^#listing=/.test(url.hash)) {
        url.searchParams.delete('listing');
        if (/^#listing=/.test(url.hash)) url.hash = '';
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
    }
  };

  const handleGoToPublish = () => {
    setEditingListing(null);
    setActiveView('publish');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditListing = (listing: Listing) => {
    setEditingListing(listing);
    setActiveView('publish');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (tab: ViewTab) => {
    if (tab === 'publish') {
      setEditingListing(null);
    }
    setActiveView(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAdminSignOut = async () => {
    await signOutUser();
    setActiveView('home');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      if (url.hash.toLowerCase().includes('admin')) {
        url.hash = '';
      }
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  };

  const currentUserName =
    profile?.displayName ||
    user?.displayName ||
    (!isSyntheticWhatsAppEmail(user?.email) && user?.email) ||
    user?.phoneNumber ||
    'Mon espace';
  const whatsappSupportUrlPrimary = buildWhatsAppUrl(
    config.whatsappNumber || '2290157382961',
    'Bonjour GidaColocs, j’ai besoin d’assistance sur la plateforme.',
  );
  const whatsappSecondary = config.whatsappSecondaryNumber || '22776688125';
  const whatsappSupportUrlSecondary = buildWhatsAppUrl(
    whatsappSecondary,
    'Bonjour GidaColocs, j’ai besoin d’assistance sur la plateforme.',
  );

  const pendingOrdersCount = allOrders.filter((o) => o.status === 'pending').length;
  const pendingListingsCount = allListings.filter(
    (l) => l.status === 'pending' || l.status === 'in_review' || l.status === 'needs_correction',
  ).length;
  const pendingColocProfilesCount = allColocProfiles.filter(
    (p) => (p.moderationStatus || 'pending') === 'pending',
  ).length;
  const pendingColocInterestsCount = allColocInterests.filter(
    (i) => (i.moderationStatus || 'pending') === 'pending',
  ).length;
  const pendingCommentsReviewsCount =
    allColocMessages.filter((m) => (m.moderationStatus || 'pending') === 'pending').length +
    allListingReviews.filter((r) => (r.moderationStatus || 'pending') === 'pending').length;
  const unreadAdminAlertsCount = adminAlerts.filter((a) => !a.read).length;
  const openListingReportsCount = allReports.filter((r) => r.status === 'open').length;
  const openColocReportsCount = allColocReports.filter((r) => r.status === 'open').length;
  const openReportsCount = openListingReportsCount + openColocReportsCount;
  const adminBadgeCount =
    pendingOrdersCount +
    pendingListingsCount +
    pendingColocProfilesCount +
    pendingColocInterestsCount +
    pendingCommentsReviewsCount +
    unreadAdminAlertsCount +
    openReportsCount;
  const unreadNotificationsCount = myNotifications.filter((n) => !n.read).length;
  const selectedListingConfirmation = selectedListing
    ? myRentalConfirmations.find((c) => c.listingId === selectedListing.id) || null
    : null;
  const officialCommunityUrl = config.whatsappGroupUrl || OFFICIAL_WHATSAPP_GROUP_URL;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#060B1D] text-slate-900 dark:text-slate-100">
      {/* Top Navigation Bar — Compact Single Row on Mobile & 3-Zone on Desktop */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0B1228]/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          {/* Left Brand Zone */}
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer text-left"
          >
            <BrandLogo size="md" />
          </button>

          {/* Center Nav Zone (Desktop) */}
          <nav aria-label="Navigation principale" className="hidden md:flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNavigate('home')}
              className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'home'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0B1437] dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Logements
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('coloc')}
              className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'coloc'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0B1437] dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Colocation
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('publish')}
              className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeView === 'publish'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0B1437] dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Publier
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('account')}
              className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                activeView === 'account'
                  ? 'bg-slate-100 dark:bg-slate-800 text-[#0B1437] dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Mon espace</span>
              {unreadNotificationsCount > 0 && (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  ({unreadNotificationsCount})
                </span>
              )}
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className={`px-3.5 py-2 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                  activeView === 'admin'
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Admin</span>
                {adminBadgeCount > 0 && (
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    ({adminBadgeCount})
                  </span>
                )}
              </button>
            )}
          </nav>

          {/* Right Action Zone */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
              title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleNavigate('account')}
                  className="min-h-[40px] flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-[#0B1437] dark:hover:text-white cursor-pointer"
                >
                  <Avatar
                    name={currentUserName}
                    src={profile?.photoURL || user.photoURL || ''}
                    size="sm"
                  />
                  <span className="hidden sm:inline max-w-[140px] truncate">
                    {currentUserName}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={signOutUser}
                  aria-label="Se déconnecter"
                  title="Se déconnecter"
                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openAuthModal}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-[#0B1437] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Connexion</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        {isSuspended && (
          <div className="mb-6 p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-[13px] font-medium text-red-800 dark:text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">
                  Votre compte est temporairement suspendu par l’administration GidaColocs.
                </p>
                {profile?.suspendedReason && (
                  <p className="text-red-700 dark:text-red-300">
                    Motif : {profile.suspendedReason}
                  </p>
                )}
                <p className="text-xs text-red-700/90 dark:text-red-300/90">
                  La publication d’annonces, les demandes de Pass Visite et les messages sont désactivés jusqu’à réactivation.
                </p>
              </div>
            </div>
            <a
              href={whatsappSupportUrlPrimary}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shrink-0 self-start sm:self-center"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Contacter l’équipe</span>
            </a>
          </div>
        )}

        {authError && !authModalOpen && (
          <div className="mb-6 p-4 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-[13px] font-medium text-red-700 dark:text-red-300">
            {authError}
          </div>
        )}

        {statusBanner && (
          <div
            role="status"
            className={`mb-6 p-4 rounded-2xl border text-[13px] flex items-center justify-between gap-3 ${
              statusBanner.type === 'success'
                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {statusBanner.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{statusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="Fermer la notification"
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeView === 'home' && (
          <HomeExploreView
            listings={publicListings}
            colocProfiles={colocProfiles}
            loading={loadingPublic}
            config={config}
            onSelectListing={handleSelectListing}
            onGoToPublish={handleGoToPublish}
            onGoToColocation={() => handleNavigate('coloc')}
            onGoToAccount={() => handleNavigate('account')}
          />
        )}

        {activeView === 'coloc' && (
          <ColocationSpaceView
            listings={publicListings}
            colocProfiles={colocProfiles}
            myColocProfiles={myColocProfiles}
            onSelectListing={handleSelectListing}
          />
        )}

        {activeView === 'publish' && (
          <PublishListingView
            editingListing={editingListing}
            onSuccess={(message) => {
              setEditingListing(null);
              if (message) {
                setStatusBanner({ type: 'success', text: message });
              }
              handleNavigate(isAdmin ? 'admin' : 'account');
            }}
            onCancelEdit={() => {
              setEditingListing(null);
              handleNavigate('account');
            }}
          />
        )}

        {activeView === 'account' && (
          <UserSpaceView
            config={config}
            myListings={myListings}
            myColocProfiles={myColocProfiles}
            myOrders={myOrders}
            passAccessList={passAccessList}
            notifications={myNotifications}
            myRentalConfirmations={myRentalConfirmations}
            onOpenRentalConfirmation={(conf) => setSelectedConfirmation(conf)}
            onEditListing={handleEditListing}
            onSelectListing={handleSelectListing}
            onGoToPublish={handleGoToPublish}
          />
        )}

        {activeView === 'admin' &&
          (!authReady ? (
            <section className="max-w-lg mx-auto bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-indigo-400/20 rounded-2xl p-8 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-[#0B1437] border border-slate-200 dark:border-slate-700 flex items-center justify-center mx-auto">
                <Shield className="w-6 h-6 text-[#0B1437] dark:text-[#93A3FF] animate-pulse" />
              </div>
              <h2 className="text-lg font-display font-bold text-[#0B1437] dark:text-white">
                Vérification de l’accès administrateur...
              </h2>
              <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">
                Contrôle de votre session Firebase sécurisée en cours.
              </p>
            </section>
          ) : isAdmin ? (
            <AdminDashboardView
              config={config}
              allListings={allListings}
              allOrders={allOrders}
              allReports={allReports}
              allColocProfiles={allColocProfiles}
              allColocInterests={allColocInterests}
              allColocMessages={allColocMessages}
              allListingReviews={allListingReviews}
              allColocReports={allColocReports}
              allUsers={allUsers}
              activities={activities}
              adminAlerts={adminAlerts}
              allRentalConfirmations={allRentalConfirmations}
              onGoToPublish={handleGoToPublish}
              onEditListing={handleEditListing}
              onSignOut={handleAdminSignOut}
            />
          ) : (
            <section className="max-w-md mx-auto bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-indigo-400/20 rounded-2xl overflow-hidden shadow-xl">
              <div className="hero-diamond-pattern text-white px-6 py-5 text-center space-y-2 border-b border-indigo-400/20">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto">
                  <Shield className="w-6 h-6 text-teal-300" />
                </div>
                <h2 className="text-xl font-display font-extrabold text-white">
                  Connexion Administrateur
                </h2>
                <p className="text-xs font-medium text-slate-200 leading-relaxed">
                  Accès strictement réservé à l’administrateur GidaColocs. Aucune inscription
                  publique possible.
                </p>
              </div>

              <div className="p-6 sm:p-7 space-y-5">
              {adminUidMissingDoc && user ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[13px] font-medium text-amber-900 dark:text-amber-200 space-y-2.5 text-left">
                  <p className="font-bold">
                    Authentification réussie — Finalisation Firebase requise
                  </p>
                  <p>
                    Votre compte est connecté sur Firebase Authentication, mais le document
                    d’autorisation côté serveur n’existe pas encore dans Firestore.
                  </p>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-[#0B1437] border border-amber-200 dark:border-amber-800 font-mono text-xs break-all select-all">
                    UID : {user.uid}
                  </div>
                  <p className="text-xs leading-relaxed">
                    Dans la console Firebase (base{' '}
                    <strong>ai-studio-5de74dcc-9250-46f1-84bb-3203c62095b4</strong>), créez le
                    document <code>admins/{user.uid}</code> avec{' '}
                    <code>role: &quot;admin&quot;</code>, puis rechargez la page.
                  </p>
                  <button
                    type="button"
                    onClick={handleAdminSignOut}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 bg-white dark:bg-[#0B1437] rounded-xl cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Se déconnecter</span>
                  </button>
                </div>
              ) : (
                <>
                  {user && (
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[13px] font-medium text-amber-800 dark:text-amber-300">
                      La session utilisateur actuelle ({currentUserName}) ne dispose pas des droits
                      administrateur. Saisissez vos identifiants administrateur ci-dessous.
                    </div>
                  )}

                  {(adminLoginLocalError || authError) && (
                    <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-[13px] font-medium text-red-700 dark:text-red-300">
                      {adminLoginLocalError || authError}
                    </div>
                  )}

                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (adminSigningIn) return;
                      setAdminLoginLocalError(null);
                      clearAuthError();
                      if (!adminPassword || adminPassword.length < 6) {
                        setAdminLoginLocalError('Saisissez votre mot de passe administrateur.');
                        return;
                      }
                      setAdminSigningIn(true);
                      try {
                        const ok = await signInAdminWithPhonePassword(adminPhone, adminPassword);
                        if (ok) {
                          setAdminPassword('');
                        }
                      } finally {
                        setAdminSigningIn(false);
                      }
                    }}
                    className="space-y-4 text-left"
                  >
                    <div>
                      <label
                        htmlFor="admin-login-phone"
                        className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Numéro ou e-mail administrateur
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="admin-login-phone"
                          type="text"
                          required
                          autoComplete="username"
                          value={adminPhone}
                          onChange={(e) => {
                            setAdminLoginLocalError(null);
                            clearAuthError();
                            setAdminPhone(e.target.value);
                          }}
                          placeholder="70000000"
                          className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 text-[15px] font-medium tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="admin-login-password"
                        className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        Mot de passe administrateur
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="admin-login-password"
                          type={showAdminPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={adminPassword}
                          onChange={(e) => {
                            setAdminLoginLocalError(null);
                            clearAuthError();
                            setAdminPassword(e.target.value);
                          }}
                          placeholder="••••••••••••"
                          className="w-full min-h-[46px] pl-10 pr-11 py-2.5 text-[15px] font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1437] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#93A3FF]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminPassword((v) => !v)}
                          aria-label={
                            showAdminPassword
                              ? 'Masquer le mot de passe'
                              : 'Afficher le mot de passe'
                          }
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          {showAdminPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={adminSigningIn}
                      className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-[#93A3FF] dark:text-[#0B1437] dark:hover:bg-[#A6B3FF] disabled:opacity-60 rounded-xl cursor-pointer"
                    >
                      <Shield className="w-4 h-4" />
                      <span>
                        {adminSigningIn ? 'Vérification...' : 'Accéder au tableau de bord'}
                      </span>
                    </button>
                  </form>

                  <div className="relative flex items-center py-0.5">
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                    <span className="shrink-0 mx-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      ou accès Google autorisé
                    </span>
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                  </div>

                  <button
                    type="button"
                    onClick={signInWithGoogleSelectAccount}
                    className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-[#0B1437] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
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
                    <span>Connexion Google administrateur</span>
                  </button>
                </>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-2">
                  {user && !adminUidMissingDoc && (
                    <button
                      type="button"
                      onClick={handleAdminSignOut}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Déconnexion</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleNavigate('home')}
                    className="min-h-[40px] px-3.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Retour aux logements
                  </button>
                </div>
              </div>
              </div>
            </section>
          ))}
      </main>

      {/* Footer (cleared above mobile bottom tab bar) */}
      <footer className="border-t border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0B1228] mt-12 pb-24 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-3.5 select-none">
            <BrandLogo
              size="md"
              subtitle="Colocation & logements vérifiés à Maradi, Niger."
            />
          </div>

          <div className="w-full lg:w-auto flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
            <a
              href={officialCommunityUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>Groupe WhatsApp GidaColocs</span>
            </a>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={whatsappSupportUrlPrimary}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-xl transition-colors tabular-nums"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{config.whatsappNumber || '2290157382961'}</span>
              </a>

              {whatsappSecondary && whatsappSecondary !== config.whatsappNumber && (
                <a
                  href={whatsappSupportUrlSecondary}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-xl transition-colors tabular-nums"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{whatsappSecondary}</span>
                </a>
              )}

              <PWAInstallButton />

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5" />
                    <span>Clair</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5" />
                    <span>Sombre</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                aria-label="Portail sécurisé"
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center p-1.5 text-slate-400/60 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 rounded-xl transition-colors cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Ergonomic Mobile Bottom Navigation Bar (Thumb-Zone) */}
      <nav
        aria-label="Navigation mobile"
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-white/95 dark:bg-[#0B1228]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/90 grid ${
          isAdmin ? 'grid-cols-5' : 'grid-cols-4'
        } items-center px-1`}
      >
        <button
          type="button"
          onClick={() => handleNavigate('home')}
          className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
            activeView === 'home'
              ? 'text-[#0B1437] dark:text-[#93A3FF]'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Building2 className="w-5 h-5" />
          <span>Logements</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigate('coloc')}
          className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
            activeView === 'coloc'
              ? 'text-[#0B1437] dark:text-[#93A3FF]'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Coloc</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigate('publish')}
          className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
            activeView === 'publish'
              ? 'text-teal-700 dark:text-teal-300'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <PlusCircle className="w-5 h-5" />
          <span>Publier</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavigate('account')}
          className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
            activeView === 'account'
              ? 'text-[#0B1437] dark:text-[#93A3FF]'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <User className="w-5 h-5" />
          <span>
            Espace{unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount})` : ''}
          </span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => handleNavigate('admin')}
            className={`h-full flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
              activeView === 'admin'
                ? 'text-teal-700 dark:text-teal-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span>Admin{adminBadgeCount > 0 ? ` (${adminBadgeCount})` : ''}</span>
          </button>
        )}
      </nav>

      {/* Auth Modal (WhatsApp & Google) */}
      <AuthModal whatsappSupportPrimary={config.whatsappNumber} />

      {/* Listing Detail Modal */}
      <ListingDetailModal
        listing={selectedListing}
        config={config}
        userOrders={myOrders}
        passAccessList={passAccessList}
        rentalConfirmation={selectedListingConfirmation}
        onOpenRentalConfirmation={(conf) => setSelectedConfirmation(conf)}
        onClose={handleCloseListing}
      />

      {/* Page / Modale dédiée de confirmation officielle de location (WhatsApp communautaire) */}
      {selectedConfirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmation de location"
          className="fixed inset-0 z-50 bg-[#060B1D]/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-indigo-400/20 rounded-2xl shadow-2xl overflow-hidden">
            <div className="hero-diamond-pattern text-white px-6 py-4 border-b border-indigo-400/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-white">
                    Confirmation officielle de location
                  </h3>
                  <p className="text-xs font-medium text-teal-300">
                    GidaColocs · Logement attribué et confirmé
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConfirmation(null)}
                aria-label="Fermer"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-[13px]">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B1437] border border-slate-200 dark:border-slate-700/80 space-y-1.5">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedConfirmation.listingTitle}
                </p>
                <p className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                  {selectedConfirmation.neighborhood} ·{' '}
                  {formatFcfa(selectedConfirmation.priceFcfa)} / mois
                </p>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                  Bailleur : {selectedConfirmation.landlordName} · Confirmée le{' '}
                  {new Date(selectedConfirmation.confirmedAtIso).toLocaleString('fr-FR')} par{' '}
                  {selectedConfirmation.confirmedByName}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-2 text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Bienvenue dans votre nouveau logement !</span>
                </div>
                <p className="leading-relaxed text-[13px] font-medium">
                  {selectedConfirmation.welcomeMessage}
                </p>
              </div>

              <a
                href={officialCommunityUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>REJOINDRE NOTRE COMMUNAUTÉ WHATSAPP</span>
              </a>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedConfirmation(null)}
                  className="min-h-[40px] px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <GidaColocsPlatform />
      </AuthProvider>
    </ErrorBoundary>
  );
}
