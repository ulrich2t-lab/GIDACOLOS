import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function translateFirestoreMessage(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (lower.includes('quota exceeded')) {
    return 'Le quota quotidien de la base de données est atteint. Réessayez plus tard.';
  }
  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return 'Autorisation insuffisante pour cette action. Vérifiez que votre session est bien active.';
  }
  if (lower.includes('client is offline') || lower.includes('unavailable') || lower.includes('network')) {
    return 'Connexion réseau ou base de données temporairement indisponible. Vérifiez votre accès Internet.';
  }
  if (lower.includes('not-found') || lower.includes('no document to update')) {
    return 'Élément introuvable ou déjà supprimé.';
  }
  return rawMessage;
}

export function formatFirestoreErrorMessage(
  err: unknown,
  fallback = 'Une erreur est survenue lors de l’opération.',
): string {
  if (!(err instanceof Error)) {
    return typeof err === 'string' && err.trim() ? translateFirestoreMessage(err) : fallback;
  }
  const msg = err.message || fallback;
  try {
    const parsed = JSON.parse(msg) as Partial<FirestoreErrorInfo>;
    if (parsed && typeof parsed.error === 'string') {
      return translateFirestoreMessage(parsed.error);
    }
  } catch {
    // Not JSON
  }
  return translateFirestoreMessage(msg);
}

export function reportFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): string {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return translateFirestoreMessage(errInfo.error);
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
