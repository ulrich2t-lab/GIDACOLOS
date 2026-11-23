import { Timestamp } from 'firebase/firestore';

export type AccountType = 'tenant' | 'landlord';
export type AccountStatus = 'active' | 'suspended';
export type PropertyType =
  | 'chambre'
  | 'maison'
  | 'appartement'
  | 'maison_partagee'
  | 'annexe'
  | 'studio'
  | 'colocation'
  | 'autre';
export type DepositorStatus = 'proprietaire' | 'demarcheur' | 'representant';
export type BathroomType = 'interne' | 'externe' | 'partagee';
export type ToiletType = 'interne' | 'externe';
export type FurnishedType = 'non_meuble' | 'semi_meuble' | 'meuble';
export type WaterElectricityType = 'inclus' | 'compteur_individuel' | 'partage';
export type RoommatePreference = 'mixte' | 'etudiants' | 'femmes' | 'hommes' | 'jeunes_actifs';

export type ContentModerationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_correction';

export type ListingStatus =
  | 'pending'
  | 'in_review'
  | 'needs_correction'
  | 'published'
  | 'reserved'
  | 'rented'
  | 'rejected'
  | 'suspended';
/** 'contract' conservé uniquement en lecture seule pour les archives historiques existantes */
export type OrderType = 'visit_pass' | 'top_listing' | 'contract';
export type PaymentMethod =
  | 'MTN Mobile Money'
  | 'Airtel Money'
  | 'Nita'
  | 'Moov Money'
  | 'Amana Express'
  | 'Al-Izza'
  | 'Espèces / Agence';
export type OrderStatus = 'pending' | 'verified' | 'rejected' | 'failed' | 'refunded';
export type ReportReason =
  | 'fausse_annonce'
  | 'arnaque_prix'
  | 'deja_loue'
  | 'contenu_inapproprie'
  | 'autre';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ActivityTargetType =
  | 'listing'
  | 'order'
  | 'report'
  | 'config'
  | 'user'
  | 'coloc'
  | 'community'
  | 'rental'
  | 'review';
export type NotificationCategory = 'listing' | 'payment' | 'coloc' | 'account' | 'system';

export type ColocDesiredType = 'maison_partagee' | 'annexe' | 'chambre' | 'appartement';
export type ColocGenderPreference = 'mixte' | 'femmes' | 'hommes' | 'etudiants';
export type ColocProfileStatus = 'active' | 'found';
export type ColocStatusCategory = 'etudiant' | 'travailleur' | 'autre';

export type ColocConversationStatus = 'pending' | 'accepted' | 'rejected' | 'blocked' | 'left';
export type ColocMeetingStatus = 'proposed' | 'accepted' | 'declined' | 'confirmed' | 'cancelled';
export type ColocReportContextType = 'coloc_profile' | 'coloc_chat' | 'coloc_meeting';
export type CommunityPostCategory = 'entraide' | 'conseil' | 'colocation' | 'info_udm';

export interface PlatformConfig {
  visitPassPrice: number;
  topListingPrice: number;
  topListingDurationDays?: number;
  /** @deprecated Conservé uniquement pour rétrocompatibilité lecture */
  contractPrice?: number;
  whatsappNumber: string;
  whatsappSecondaryNumber?: string;
  whatsappGroupUrl?: string;
  whatsappGroupLink?: string;
  mtnNumber?: string;
  moovNumber: string;
  airtelNumber: string;
  nitaAccount: string;
  updatedAt?: Timestamp;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  accountType: AccountType;
  neighborhood: string;
  accountStatus?: AccountStatus;
  suspendedReason?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserPrivateInfo {
  email: string;
  phone: string;
  verifiedPhones?: string[];
  updatedAt?: Timestamp;
}

export interface ListingVideo {
  id: string;
  title: string;
  sourceType: 'url' | 'clip';
  url: string;
  clipId: string;
  durationSec: number;
}

export interface ListingVideoClip {
  id: string;
  ownerId: string;
  title: string;
  mimeType: 'video/webm' | 'video/mp4';
  dataUrl: string;
  durationSec: number;
  isPublic: boolean;
  createdAt?: Timestamp;
}

export interface ListingModerationEntry {
  status: ListingStatus;
  reason: string;
  actorName: string;
  actorEmail?: string;
  atIso: string;
}

export interface ContentModerationEntry {
  status: ContentModerationStatus;
  reason: string;
  actorName: string;
  actorEmail?: string;
  atIso: string;
}

export interface UserNotification {
  id: string;
  userId: string;
  senderId?: string;
  category: NotificationCategory;
  title: string;
  message: string;
  targetId?: string;
  read: boolean;
  createdAt?: Timestamp;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  neighborhood: string;
  locationDetails?: string;
  propertyType: PropertyType;
  priceFcfa: number;
  depositMonths: number;
  availableSpots: number;
  roomsCount?: number;
  availability?: string;
  amenities: string[];
  photos: string[];
  videos?: ListingVideo[];
  bathroomType?: BathroomType;
  toiletType?: ToiletType;
  furnished?: FurnishedType;
  waterElectricity?: WaterElectricityType;
  surfaceSqm?: number;
  roommatePreference?: RoommatePreference;
  houseRules?: string;
  status: ListingStatus;
  moderationReason?: string;
  moderationHistory?: ListingModerationEntry[];
  validatedByName?: string;
  validatedByEmail?: string;
  validatedAtIso?: string;
  isVerifiedQolock: boolean;
  isTop: boolean;
  topRequested: boolean;
  ownerId: string;
  ownerName: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ListingPrivateContact {
  ownerId: string;
  contactName: string;
  contactPhone: string;
  updatedAt?: Timestamp;
}

export interface ListingPrivateVerification {
  ownerId: string;
  contactName: string;
  contactPhone: string;
  contactWhatsapp?: string;
  depositorAddress: string;
  depositorStatus: DepositorStatus;
  authorizationNote: string;
  updatedAt?: Timestamp;
}

export type AdminAlertType =
  | 'new_listing'
  | 'resubmitted_listing'
  | 'rental_confirmed'
  | 'new_coloc_profile'
  | 'resubmitted_coloc_profile'
  | 'new_coloc_request'
  | 'new_comment'
  | 'new_review';

export interface AdminAlert {
  id: string;
  type: AdminAlertType;
  listingId: string;
  listingTitle: string;
  neighborhood: string;
  ownerId: string;
  ownerName: string;
  depositorStatus?: DepositorStatus;
  read: boolean;
  createdAt?: Timestamp;
}

export interface RentalConfirmation {
  id: string;
  listingId: string;
  listingTitle: string;
  neighborhood: string;
  priceFcfa: number;
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  landlordId: string;
  landlordName: string;
  welcomeMessage: string;
  confirmedById: string;
  confirmedByName: string;
  confirmedByEmail?: string;
  confirmedAtIso: string;
  createdAt?: Timestamp;
}

export interface ColocInterest {
  id: string;
  listingId?: string;
  listingTitle?: string;
  userId: string;
  userName: string;
  occupation: string;
  habits: string;
  budgetFcfa: number;
  message: string;
  isPublic: boolean;
  moderationStatus?: ContentModerationStatus;
  moderationReason?: string;
  moderationHistory?: ContentModerationEntry[];
  validatedByName?: string;
  validatedAtIso?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ColocProfile {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  statusCategory?: ColocStatusCategory;
  targetNeighborhood: string;
  desiredType: ColocDesiredType;
  desiredRoommatesCount?: number;
  maxBudgetFcfa: number;
  occupation: string;
  genderPreference: ColocGenderPreference;
  lifestyle: string;
  availability?: string;
  bio: string;
  linkedListingId: string;
  status: ColocProfileStatus;
  isPublic?: boolean;
  moderationStatus?: ContentModerationStatus;
  moderationReason?: string;
  moderationHistory?: ContentModerationEntry[];
  validatedByName?: string;
  validatedAtIso?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ColocMessage {
  id: string;
  profileId?: string;
  profileAuthorId: string;
  authorId: string;
  authorName: string;
  message: string;
  isPublic: boolean;
  moderationStatus?: ContentModerationStatus;
  moderationReason?: string;
  moderationHistory?: ContentModerationEntry[];
  validatedByName?: string;
  validatedAtIso?: string;
  createdAt?: Timestamp;
}

export interface ListingReview {
  id: string;
  listingId: string;
  listingTitle: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  isPublic: boolean;
  moderationStatus: ContentModerationStatus;
  moderationReason?: string;
  moderationHistory?: ContentModerationEntry[];
  validatedByName?: string;
  validatedAtIso?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ColocConversation {
  id: string;
  participantIds: string[];
  requesterId: string;
  recipientId: string;
  requesterName: string;
  recipientName: string;
  profileId: string;
  status: ColocConversationStatus;
  blockedBy?: string;
  leftBy?: string[];
  initialMessage: string;
  lastMessage: string;
  lastSenderId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ColocPrivateMessage {
  id: string;
  participantIds: string[];
  senderId: string;
  senderName: string;
  text: string;
  createdAt?: Timestamp;
}

export interface ColocMeeting {
  id: string;
  conversationId: string;
  participantIds: string[];
  proposerId: string;
  proposerName: string;
  recipientId: string;
  recipientName: string;
  meetingDate: string;
  meetingTime: string;
  publicPlace: string;
  note: string;
  status: ColocMeetingStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ColocReportItem {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  contextType: ColocReportContextType;
  targetId: string;
  reason: string;
  details: string;
  status: ReportStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  category: CommunityPostCategory;
  title: string;
  content: string;
  isPublic: boolean;
  createdAt?: Timestamp;
}

export interface PaymentVerificationEntry {
  status: OrderStatus;
  note: string;
  actorName: string;
  atIso: string;
}

export interface ServiceOrder {
  id: string;
  orderType: OrderType;
  userId: string;
  userName: string;
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
  status: OrderStatus;
  adminNote: string;
  rejectionReason?: string;
  receiptNumber?: string;
  verificationHistory?: PaymentVerificationEntry[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PassAccess {
  id: string;
  userId: string;
  listingId: string;
  orderId: string;
  grantedAt?: Timestamp;
}

export interface ReportItem {
  id: string;
  listingId: string;
  listingTitle: string;
  reporterId: string;
  reporterName: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PlatformActivity {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetTitle: string;
  targetType: ActivityTargetType;
  createdAt?: Timestamp;
}
