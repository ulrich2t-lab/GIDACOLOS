/**
 * Synchronized validation limits matching firebase-blueprint.json and firestore.rules verbatim.
 */
export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  ID_MAX: 128,
  DISPLAY_NAME_MAX: 100,
  PHOTO_URL_MAX: 500,
  NEIGHBORHOOD_MAX: 80,
  EMAIL_MAX: 200,
  PHONE_MAX: 40,
  LISTING_TITLE_MAX: 160,
  LISTING_DESC_MAX: 4000,
  LOCATION_DETAILS_MAX: 200,
  AVAILABILITY_MAX: 80,
  DEPOSITOR_ADDRESS_MAX: 200,
  AUTHORIZATION_NOTE_MAX: 600,
  WELCOME_MESSAGE_MAX: 500,
  HOUSE_RULES_MAX: 1000,
  MAX_AMENITIES: 16,
  MAX_PHOTOS: 6,
  PHOTO_DATA_MAX_LENGTH: 145000,
  MAX_VIDEOS: 3,
  VIDEO_TITLE_MAX: 120,
  VIDEO_URL_MAX: 500,
  VIDEO_CLIP_DATA_MAX_LENGTH: 740000,
  VIDEO_CLIP_MAX_SECONDS: 60,
  TRANSACTION_REF_MAX: 100,
  PREFERRED_DATE_MAX: 32,
  ADMIN_NOTE_MAX: 300,
  REJECTION_REASON_MAX: 300,
  RECEIPT_NO_MAX: 80,
  PAYMENT_PROOF_MAX_LENGTH: 220000,
  VERIFICATION_HISTORY_MAX: 10,
  MODERATION_REASON_MAX: 300,
  MODERATION_HISTORY_MAX: 12,
  SUSPENSION_REASON_MAX: 300,
  NOTIFICATION_TITLE_MAX: 120,
  NOTIFICATION_MESSAGE_MAX: 500,
  REPORT_DETAILS_MAX: 1000,
  ACTIVITY_ACTION_MAX: 100,
  ACTIVITY_TARGET_TITLE_MAX: 160,
  COLOC_OCCUPATION_MAX: 80,
  COLOC_LIFESTYLE_MAX: 120,
  COLOC_BIO_MAX: 800,
  COLOC_MESSAGE_MAX: 600,
  COLOC_AVAILABILITY_MAX: 80,
  COLOC_PHOTO_MAX_LENGTH: 145000,
  COLOC_PRIVATE_MESSAGE_MAX: 800,
  MEETING_DATE_MAX: 20,
  MEETING_TIME_MAX: 10,
  MEETING_PLACE_MAX: 160,
  MEETING_NOTE_MAX: 300,
  WHATSAPP_GROUP_URL_MAX: 300,
  COLOC_REPORT_REASON_MAX: 100,
  COMMUNITY_TITLE_MAX: 140,
  COMMUNITY_CONTENT_MAX: 1000,
  REVIEW_COMMENT_MAX: 800,
} as const;

export function sanitizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function clampText(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

export function isValidFirestoreId(id: string): boolean {
  return id.length >= 1 && id.length <= BLUEPRINT_LIMITS.ID_MAX && BLUEPRINT_LIMITS.ID_PATTERN.test(id);
}

export function normalizeTransactionRefKey(ref: string): string {
  const cleaned = ref.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 100);
  return cleaned || 'REF_VIDE';
}

/**
 * Compresses an uploaded image file on canvas so it loads rapidly on 3G/4G networks
 * in Maradi and stays well below Firestore document boundaries.
 */
export function compressImageToDataUrl(file: File, maxDimension = 720, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format d’image non pris en charge.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Contexte graphique indisponible.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let output = canvas.toDataURL('image/jpeg', quality);
        if (output.length > BLUEPRINT_LIMITS.PHOTO_DATA_MAX_LENGTH) {
          output = canvas.toDataURL('image/jpeg', 0.52);
        }
        if (output.length > BLUEPRINT_LIMITS.PHOTO_DATA_MAX_LENGTH) {
          output = canvas.toDataURL('image/jpeg', 0.38);
        }
        if (output.length > BLUEPRINT_LIMITS.PHOTO_DATA_MAX_LENGTH) {
          reject(new Error('Image trop volumineuse même après compression.'));
          return;
        }
        resolve(output);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
