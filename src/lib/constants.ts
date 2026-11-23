import type {
  BathroomType,
  ColocDesiredType,
  ColocGenderPreference,
  DepositorStatus,
  FurnishedType,
  PaymentMethod,
  PlatformConfig,
  PropertyType,
  ReportReason,
  RoommatePreference,
  ToiletType,
  WaterElectricityType,
} from '../types/platform';

export const ADMIN_EMAIL_SHA256 =
  'b74c4eca646c3463515e80f971be647f2ccd693a9ccb7f00d98dd56403cf510a';

export const ADMIN_EMAIL_SHA256_LIST = [
  'b74c4eca646c3463515e80f971be647f2ccd693a9ccb7f00d98dd56403cf510a',
  '2de0e22a42804c94c4dbaa640171236f41d1c62f7f09db70ba7e221617fe7bfc',
] as const;

export const RESERVED_ADMIN_PHONE = '+2290157382961';
export const RESERVED_ADMIN_AUTH_EMAIL = 'wa.2290157382961@qolock.app';

export const MARADI_NEIGHBORHOODS = [
  'Ali Dan Sofo',
  'Sabon Gari',
  'Zone UDM',
  'Zaria',
  'Bagalam',
  'Sonitel',
  'Maradi Centre',
  'Tchizon',
  'Dan Goulbi',
] as const;

export const PROPERTY_TYPES: Array<{ value: PropertyType; label: string; description: string }> = [
  {
    value: 'chambre',
    label: 'Chambre unique',
    description: 'Chambre individuelle (douche interne ou externe)',
  },
  {
    value: 'studio',
    label: 'Studio',
    description: 'Pièce principale avec cuisine et douche interne',
  },
  {
    value: 'appartement',
    label: 'Appartement',
    description: 'Appartement autonome (chambres + salon)',
  },
  {
    value: 'maison',
    label: 'Maison',
    description: 'Maison entière ou villa familiale',
  },
  {
    value: 'maison_partagee',
    label: 'Maison à partager',
    description: 'Concession ou grande maison en colocation',
  },
  {
    value: 'annexe',
    label: 'Annexe',
    description: 'Annexe indépendante dans une cour',
  },
  {
    value: 'autre',
    label: 'Autre logement',
    description: 'Autre type de logement ou hébergement à louer',
  },
];

export const DEPOSITOR_STATUS_OPTIONS: Array<{
  value: DepositorStatus;
  label: string;
  description: string;
}> = [
  {
    value: 'proprietaire',
    label: 'Propriétaire',
    description: 'Je suis le propriétaire direct du logement',
  },
  {
    value: 'demarcheur',
    label: 'Démarcheur',
    description: 'Je mets ce bien en location pour le propriétaire',
  },
  {
    value: 'representant',
    label: 'Représentant',
    description: 'Membre de la famille ou mandataire autorisé',
  },
];

export const LISTING_AVAILABILITY_PRESETS = [
  'Disponible immédiatement',
  'Disponible sous 7 jours',
  'Disponible fin du mois',
  'Rentrée universitaire',
] as const;

export const BATHROOM_OPTIONS: Array<{ value: BathroomType; label: string }> = [
  { value: 'interne', label: 'Douche interne (privée)' },
  { value: 'externe', label: 'Douche externe (privée dans la cour)' },
  { value: 'partagee', label: 'Douche partagée' },
];

export const TOILET_OPTIONS: Array<{ value: ToiletType; label: string }> = [
  { value: 'interne', label: 'WC interne' },
  { value: 'externe', label: 'WC externe' },
];

export const FURNISHED_OPTIONS: Array<{ value: FurnishedType; label: string }> = [
  { value: 'non_meuble', label: 'Non meublé' },
  { value: 'semi_meuble', label: 'Semi-meublé' },
  { value: 'meuble', label: 'Meublé' },
];

export const UTILITY_OPTIONS: Array<{ value: WaterElectricityType; label: string }> = [
  { value: 'compteur_individuel', label: 'Compteur individuel (NIGELEC / SEEN)' },
  { value: 'partage', label: 'Charges eau & électricité partagées' },
  { value: 'inclus', label: 'Eau & électricité incluses dans le loyer' },
];

export const ROOMMATE_PREFERENCES: Array<{ value: RoommatePreference; label: string }> = [
  { value: 'etudiants', label: 'Étudiants (UDM / Instituts)' },
  { value: 'jeunes_actifs', label: 'Jeunes actifs / Salariés' },
  { value: 'femmes', label: 'Femmes uniquement' },
  { value: 'hommes', label: 'Hommes uniquement' },
  { value: 'mixte', label: 'Tout profil sérieux (Mixte)' },
];

export const COLOC_DESIRED_TYPES: Array<{ value: ColocDesiredType; label: string }> = [
  { value: 'maison_partagee', label: 'Maison à partager' },
  { value: 'annexe', label: 'Annexe partagée' },
  { value: 'appartement', label: 'Appartement partagé' },
  { value: 'chambre', label: 'Chambre en cour calme' },
];

export const COLOC_GENDER_OPTIONS: Array<{ value: ColocGenderPreference; label: string }> = [
  { value: 'etudiants', label: 'Entre étudiants' },
  { value: 'femmes', label: 'Colocation féminine' },
  { value: 'hommes', label: 'Colocation masculine' },
  { value: 'mixte', label: 'Mixte / Ouvert' },
];

export const LIFESTYLE_PRESETS = [
  'Calme et studieux',
  'Non-fumeur',
  'Propre et organisé',
  'Matinal',
  'Ouvert aux repas partagés',
  'Pas d’invités tardifs',
] as const;

export const AMENITIES_OPTIONS = [
  'Eau courante (SEEN)',
  'Forage / Château d’eau',
  'Électricité (NIGELEC)',
  'Solaire / Groupe',
  'Ventilateur',
  'Climatisation',
  'Carrelage',
  'Plafond isolé',
  'Cour fermée / Gardien',
  'Cuisine équipée',
  'Véranda / Terrasse',
  'Proche UDM',
  'Accès goudron',
  'Wi-Fi',
] as const;

export const PAYMENT_METHODS: PaymentMethod[] = [
  'MTN Mobile Money',
  'Airtel Money',
  'Nita',
  'Moov Money',
  'Amana Express',
  'Al-Izza',
  'Espèces / Agence',
];

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'deja_loue', label: 'Logement déjà loué' },
  { value: 'arnaque_prix', label: 'Prix ou caution incohérent' },
  { value: 'fausse_annonce', label: 'Annonce fictive ou photos trompeuses' },
  { value: 'contenu_inapproprie', label: 'Contenu inapproprié' },
  { value: 'autre', label: 'Autre signalement' },
];

export const OFFICIAL_WHATSAPP_GROUP_URL =
  'https://chat.whatsapp.com/D1ky36zf8Ko2rfPsiuryvT?s=cl&p=a&iam=2';

export const COLOC_STATUS_CATEGORIES = [
  { value: 'etudiant', label: 'Étudiant(e)' },
  { value: 'travailleur', label: 'Travailleur / Salarié' },
  { value: 'autre', label: 'Autre profil' },
] as const;

export const MARADI_PUBLIC_MEETING_PLACES = [
  'Entrée principale de l’Université Dan Dicko Dankoulodo (UDM)',
  'Place du Grand Marché de Maradi',
  'Rond-point Sonitel / Centre-ville',
  'Station Total Sabon Gari',
  'Agence NITA / Axe principal Ali Dan Sofo',
  'Carrefour Zaria',
] as const;

export const COLOC_REPORT_REASONS = [
  'Comportement suspect ou harcèlement',
  'Demande d’argent suspecte',
  'Faux profil ou usurpation',
  'Propos inappropriés',
  'Autre comportement abusif',
] as const;

export const COMMUNITY_POST_CATEGORIES = [
  { value: 'entraide', label: 'Entraide étudiante' },
  { value: 'colocation', label: 'Recherche coloc / chambre' },
  { value: 'conseil', label: 'Conseil quartier' },
  { value: 'info_udm', label: 'Vie campus & UDM' },
] as const;

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  visitPassPrice: 2000,
  topListingPrice: 1000,
  topListingDurationDays: 7,
  whatsappNumber: '+2290157382961',
  whatsappSecondaryNumber: '+22776688125',
  whatsappGroupUrl: OFFICIAL_WHATSAPP_GROUP_URL,
  mtnNumber: '+2290157382961',
  moovNumber: '+22776688125',
  airtelNumber: '+22776688125',
  nitaAccount: '+22776688125',
};

export function getPaymentInstructionDetails(
  method: PaymentMethod,
  config: PlatformConfig,
): { beneficiary: string; steps: string } {
  const airtel = config.airtelNumber || '+22776688125';
  const nita = config.nitaAccount || '+22776688125';
  const mtn = config.mtnNumber || '+2290157382961';
  const moov = config.moovNumber || '+22776688125';

  switch (method) {
    case 'Airtel Money':
      return {
        beneficiary: airtel,
        steps: `Envoyez le montant exact via Airtel Money vers ${airtel}, puis saisissez l’ID de transaction reçu par SMS et joignez si possible une capture d’écran.`,
      };
    case 'Nita':
      return {
        beneficiary: nita,
        steps: `Effectuez votre transfert NITA / MyNITA vers le numéro bénéficiaire ${nita}, puis indiquez le code/référence du bordereau ou SMS.`,
      };
    case 'MTN Mobile Money':
      return {
        beneficiary: mtn,
        steps: `Envoyez le montant exact via MTN Mobile Money vers ${mtn}, puis recopiez la référence de transaction et joignez votre capture si disponible.`,
      };
    case 'Moov Money':
      return {
        beneficiary: moov,
        steps: `Effectuez le transfert Moov Money vers ${moov}, puis indiquez la référence SMS de confirmation.`,
      };
    case 'Amana Express':
    case 'Al-Izza':
      return {
        beneficiary: nita,
        steps: `Transférez via ${method} à l’ordre du compte GidaColocs (${nita}) et indiquez le numéro de reçu/code de transfert.`,
      };
    default:
      return {
        beneficiary: config.whatsappNumber || '+2290157382961',
        steps: `Réglez auprès d’un agent vérifié GidaColocs et saisissez le numéro de reçu remis en agence.`,
      };
  }
}

export const BRAND_ASSETS = {
  iconLight: '/assets/aistudio/WhatsApp_Image_2026-11-18_at_20.07.56_cd8c0dbf.jpeg',
  iconDark: '/assets/aistudio/WhatsApp_Image_2026-11-18_at_20.07.54_3e578e17.jpeg',
  logoCommunity: '/assets/aistudio/WhatsApp_Image_2026-11-18_at_20.08.03_b7009ff0.jpeg',
} as const;
