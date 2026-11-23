import type { Timestamp } from 'firebase/firestore';
import type {
  AccountStatus,
  AccountType,
  BathroomType,
  ColocConversationStatus,
  ColocDesiredType,
  ColocGenderPreference,
  ColocMeetingStatus,
  ColocStatusCategory,
  CommunityPostCategory,
  ContentModerationStatus,
  DepositorStatus,
  FurnishedType,
  ListingStatus,
  OrderStatus,
  OrderType,
  PropertyType,
  ReportStatus,
  RoommatePreference,
  ServiceOrder,
  ToiletType,
  WaterElectricityType,
} from '../types/platform';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  chambre: 'Chambre unique',
  maison: 'Maison',
  appartement: 'Appartement',
  maison_partagee: 'Maison à partager',
  annexe: 'Annexe',
  studio: 'Studio',
  colocation: 'Maison à partager',
  autre: 'Autre logement',
};

export const BATHROOM_LABELS: Record<BathroomType, string> = {
  interne: 'Douche interne',
  externe: 'Douche externe',
  partagee: 'Douche partagée',
};

export const TOILET_LABELS: Record<ToiletType, string> = {
  interne: 'WC interne',
  externe: 'WC externe',
};

export const FURNISHED_LABELS: Record<FurnishedType, string> = {
  non_meuble: 'Non meublé',
  semi_meuble: 'Semi-meublé',
  meuble: 'Meublé',
};

export const UTILITY_LABELS: Record<WaterElectricityType, string> = {
  inclus: 'Eau & électricité incluses',
  compteur_individuel: 'Compteur individuel',
  partage: 'Charges partagées',
};

export const ROOMMATE_PREFERENCE_LABELS: Record<RoommatePreference, string> = {
  mixte: 'Mixte',
  etudiants: 'Étudiants',
  femmes: 'Femmes uniquement',
  hommes: 'Hommes uniquement',
  jeunes_actifs: 'Jeunes actifs',
};

export const COLOC_DESIRED_LABELS: Record<ColocDesiredType, string> = {
  maison_partagee: 'Maison à partager',
  annexe: 'Annexe partagée',
  appartement: 'Appartement partagé',
  chambre: 'Chambre en cour calme',
};

export const COLOC_GENDER_LABELS: Record<ColocGenderPreference, string> = {
  mixte: 'Mixte / Ouvert',
  femmes: 'Colocation féminine',
  hommes: 'Colocation masculine',
  etudiants: 'Entre étudiants',
};

export const COMMUNITY_CATEGORY_LABELS: Record<CommunityPostCategory, string> = {
  entraide: 'Entraide étudiante',
  conseil: 'Conseil quartier',
  colocation: 'Colocation',
  info_udm: 'Vie campus & UDM',
};

export const COLOC_STATUS_CATEGORY_LABELS: Record<ColocStatusCategory, string> = {
  etudiant: 'Étudiant(e)',
  travailleur: 'Travailleur / Salarié',
  autre: 'Autre profil',
};

export const COLOC_CONV_STATUS_LABELS: Record<ColocConversationStatus, string> = {
  pending: 'Demande en attente',
  accepted: 'Discussion active',
  rejected: 'Demande refusée',
  blocked: 'Utilisateur bloqué',
  left: 'Conversation quittée',
};

export const COLOC_MEETING_STATUS_LABELS: Record<ColocMeetingStatus, string> = {
  proposed: 'Proposé',
  accepted: 'Accepté',
  declined: 'Refusé',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
};

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  pending: 'En attente de validation',
  in_review: 'En cours de vérification',
  needs_correction: 'Corrections demandées',
  published: 'Approuvée · Disponible',
  reserved: 'Approuvée · Réservé',
  rented: 'Approuvée · Louée / Occupée',
  rejected: 'Refusée',
  suspended: 'Suspendue',
};

export const CONTENT_MODERATION_LABELS: Record<ContentModerationStatus, string> = {
  pending: 'En attente de validation',
  approved: 'Approuvée',
  rejected: 'Refusée',
  needs_correction: 'À corriger',
};

export const DEPOSITOR_STATUS_LABELS: Record<DepositorStatus, string> = {
  proprietaire: 'Propriétaire',
  demarcheur: 'Démarcheur',
  representant: 'Représentant',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  tenant: 'Étudiant / Locataire',
  landlord: 'Propriétaire / Démarcheur',
};

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  visit_pass: 'Pass visite',
  top_listing: 'Annonce Top',
  contract: 'Archive contrat (historique)',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  verified: 'Confirmé',
  rejected: 'Refusé',
  failed: 'Échoué',
  refunded: 'Remboursé',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Ouvert',
  resolved: 'Traité',
  dismissed: 'Classé sans suite',
};

export function isSharedListingType(type: PropertyType): boolean {
  return type === 'maison_partagee' || type === 'colocation';
}

export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} FCFA`;
}

export function formatTimestamp(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return 'À l’instant';
  const date = ts.toDate();
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'À l’instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function buildWhatsAppUrl(phoneNumber: string, message: string): string {
  const digits = phoneNumber.replace(/[^0-9]/g, '') || '2290157382961';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'G';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadPaymentReceipt(order: ServiceOrder): void {
  const receiptNo = order.receiptNumber || `QM-${order.id.slice(-8).toUpperCase()}`;
  const issuedDate =
    order.updatedAt && typeof order.updatedAt.toDate === 'function'
      ? new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(order.updatedAt.toDate())
      : new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }).format(new Date());

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Reçu de paiement ${escapeHtml(receiptNo)} — GidaColocs</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; max-width: 680px; margin: 36px auto; padding: 0 20px; line-height: 1.55; }
    .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 24px; background: #fff; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0A2540; padding-bottom: 14px; margin-bottom: 18px; }
    h1 { font-size: 18px; margin: 0; color: #0A2540; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    td { padding: 8px 4px; border-bottom: 1px solid #e2e8f0; }
    td:first-child { color: #64748b; width: 42%; }
    td:last-child { font-weight: 600; text-align: right; }
    .total { font-size: 16px; color: #0A2540; }
    .foot { margin-top: 20px; font-size: 11px; color: #64748b; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <button onclick="window.print()" style="padding:8px 16px;background:#0A2540;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-bottom:16px;">Imprimer / Enregistrer en PDF</button>
  <div class="card">
    <div class="head">
      <div>
        <h1>GidaColocs — REÇU OFFICIEL</h1>
        <div style="font-size:12px;color:#475569;margin-top:4px;">N° ${escapeHtml(receiptNo)} · Émis le ${escapeHtml(issuedDate)}</div>
      </div>
      <span class="badge">${escapeHtml(ORDER_STATUS_LABELS[order.status])}</span>
    </div>
    <table>
      <tr><td>Client</td><td>${escapeHtml(order.userName)}</td></tr>
      <tr><td>Téléphone payeur</td><td>${escapeHtml(order.userPhone)}</td></tr>
      <tr><td>Service</td><td>${escapeHtml(ORDER_TYPE_LABELS[order.orderType])}</td></tr>
      <tr><td>Logement concerné</td><td>${escapeHtml(order.listingTitle || order.listingId)}</td></tr>
      <tr><td>Moyen de paiement</td><td>${escapeHtml(order.paymentMethod)}</td></tr>
      <tr><td>Numéro bénéficiaire</td><td>${escapeHtml(order.beneficiaryPhone || 'GidaColocs')}</td></tr>
      <tr><td>Référence transaction</td><td>${escapeHtml(order.transactionRef)}</td></tr>
      <tr><td class="total">Montant payé</td><td class="total">${escapeHtml(formatFcfa(order.amountFcfa))}</td></tr>
    </table>
    <p class="foot">
      Ce reçu atteste de l’enregistrement et de la validation manuelle de votre paiement sur GidaColocs.
      GidaColocs ne vous demandera jamais votre code PIN Mobile Money.
    </p>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `recu-gidacolocs-${receiptNo.toLowerCase()}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
