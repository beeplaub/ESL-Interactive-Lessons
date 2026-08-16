function cleanFirebaseValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function getFirebaseClientConfig() {
  return {
    apiKey: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
}

export function getFirebaseVapidKey() {
  return cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
}

export { cleanFirebaseValue };
