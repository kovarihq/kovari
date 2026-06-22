import * as admin from "firebase-admin";

function getFirebaseAdmin() {
  // If already initialized, return the existing app
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    try {
      const formattedPrivateKey = privateKey.replace(/\\n/g, "\n");
      return admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: formattedPrivateKey,
        }),
      });
    } catch (error) {
      console.error("[Firebase Admin] Initialization failed with certificate config:", error);
    }
  }

  // Fallback to Application Default Credentials (e.g. on Google Cloud environments or local file)
  try {
    return admin.initializeApp();
  } catch (error) {
    console.warn(
      "[Firebase Admin] ⚠️ Firebase credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are not set.\n" +
      "                 FCM push delivery will run in simulated mode."
    );
    return null;
  }
}

export const firebaseAdmin = getFirebaseAdmin();
