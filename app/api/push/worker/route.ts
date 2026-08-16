import { NextResponse } from "next/server";
import { cleanFirebaseValue } from "@/lib/firebase-client-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = {
    apiKey: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: cleanFirebaseValue(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  };
  const enabled = Boolean(config.apiKey && config.projectId && config.messagingSenderId && config.appId);
  const body = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', (event) => { if (event.request.method === 'GET') event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });
${enabled ? `importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(config)});
firebase.messaging().onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(payload.notification?.title || 'BrenUp', { body: payload.notification?.body || 'You have an update.', icon: '/brand/icon-192.png', badge: '/brand/favicon-32.png', data: { href: data.href || '/account' } });
});` : ""}
self.addEventListener('notificationclick', (event) => { event.notification.close(); const href = event.notification.data?.href || '/account'; event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => { const existing = windows.find((client) => 'focus' in client); if (existing) return existing.focus().then(() => existing.navigate(href)); return clients.openWindow(href); })); });`;
  return new NextResponse(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
      "service-worker-allowed": "/",
    },
  });
}
