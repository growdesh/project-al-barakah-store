import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
import defaultAppletConfig from "../../firebase-applet-config.json";

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
const hasEnvOverride = Boolean(
  env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID,
);

const firebaseConfig = hasEnvOverride
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY as string,
      authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string) || "",
      projectId: env.VITE_FIREBASE_PROJECT_ID as string,
      storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET as string) || "",
      messagingSenderId:
        (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || "",
      appId: (env.VITE_FIREBASE_APP_ID as string) || "",
    }
  : {
      apiKey: defaultAppletConfig.apiKey,
      authDomain: defaultAppletConfig.authDomain,
      projectId: defaultAppletConfig.projectId,
      storageBucket: defaultAppletConfig.storageBucket,
      messagingSenderId: defaultAppletConfig.messagingSenderId,
      appId: defaultAppletConfig.appId,
    };

const firestoreDatabaseId: string | undefined = hasEnvOverride
  ? (env.VITE_FIREBASE_DATABASE_ID as string | undefined) || undefined
  : defaultAppletConfig.firestoreDatabaseId || undefined;

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

// Online-only Firestore: memory-only cache (no IndexedDB offline persistence)
function createFirestoreInstance(): Firestore {
  try {
    const settings = { localCache: memoryLocalCache() };
    return firestoreDatabaseId
      ? initializeFirestore(app, settings, firestoreDatabaseId)
      : initializeFirestore(app, settings);
  } catch {
    return firestoreDatabaseId
      ? getFirestore(app, firestoreDatabaseId)
      : getFirestore(app);
  }
}

export const db: Firestore = createFirestoreInstance();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function checkServerConnection(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, "meta", "store"));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("the client is offline") ||
        error.message.includes("unavailable") ||
        error.message.includes("network"))
    ) {
      return false;
    }
    return typeof navigator === "undefined" ? true : navigator.onLine;
  }
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

void testConnection();
