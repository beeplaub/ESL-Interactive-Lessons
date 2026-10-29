const CERTIFICATE_FINGERPRINT_PATTERN = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$|^[A-Fa-f0-9]{64}$/;

export const dynamic = 'force-dynamic';

function getSigningFingerprints(): string[] | null {
  const configured = process.env.ANDROID_APP_SIGNING_CERT_SHA256;
  if (!configured?.trim()) return null;

  const entries = configured.split(/[\s,]+/).filter(Boolean);
  if (entries.length === 0 || entries.some((entry) => !CERTIFICATE_FINGERPRINT_PATTERN.test(entry))) {
    return null;
  }

  return [...new Set(entries.map((entry) => {
    const hex = entry.replaceAll(':', '').toUpperCase();
    return hex.match(/.{2}/g)!.join(':');
  }))];
}

export function GET() {
  const fingerprints = getSigningFingerprints();
  if (!fingerprints) {
    return Response.json(
      { error: 'Android App Links are not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json(
    [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.brenup.app',
        sha256_cert_fingerprints: fingerprints,
      },
    }],
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
