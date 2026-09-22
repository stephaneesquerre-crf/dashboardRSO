const ALLOWED_IDENTITY_EMAIL_PATTERN = /^[^@\s]+@croix-rouge\.fr$/i;

function getActiveUserEmail_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

/**
 * Trace de diagnostic d'un chargement bloqué.
 * L'adresse e-mail n'est conservée que lorsqu'elle a été transmise par Google.
 * En son absence, une empreinte temporaire et non réversible de session permet
 * seulement de rapprocher des incidents sans identifier la personne.
 */
function logUnavailableIdentity_(email, source, details) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const metadata = details || {};
  try {
    const incident = {
      event: 'pnapat.identity_unavailable',
      source: String(source || 'unknown'),
      identityStatus: normalizedEmail ? 'outside_croix_rouge_domain' : 'missing',
      email: normalizedEmail || null,
      sessionFingerprint: getTemporarySessionFingerprint_(),
      requestId: createIdentityDiagnosticRequestId_(),
      appVersion: getConfig_().APP_VERSION,
      durationMs: Number(metadata.durationMs) || 0,
      timestamp: new Date().toISOString()
    };
    console.warn(JSON.stringify(incident));
    recordTechnicalIncident_(incident);
  } catch (error) {
    // Un incident de journalisation ne doit jamais empêcher l'accès à l'outil.
    console.warn('pnapat.identity_unavailable: logging_failed');
  }
}

function logSuccessfulConnection_(email, source, details) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return;
  const metadata = details || {};
  recordTechnicalConnection_({
    event: 'pnapat.connection_success',
    source: String(source || 'unknown'),
    identityStatus: 'recognized',
    email: normalizedEmail,
    sessionFingerprint: getTemporarySessionFingerprint_(),
    requestId: createIdentityDiagnosticRequestId_(),
    appVersion: getConfig_().APP_VERSION,
    durationMs: Number(metadata.durationMs) || 0,
    accessState: String(metadata.accessState || 'granted'),
    timestamp: new Date().toISOString()
  });
}

function getTemporarySessionFingerprint_() {
  try {
    const key = String(Session.getTemporaryActiveUserKey() || '');
    if (!key) return null;
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key)
      .map((byte) => ('0' + (byte & 0xFF).toString(16)).slice(-2))
      .join('')
      .slice(0, 16);
  } catch (error) {
    return null;
  }
}

function createIdentityDiagnosticRequestId_() {
  try {
    return Utilities.getUuid();
  } catch (error) {
    return null;
  }
}

function isAllowedIdentityEmail_(email) {
  return ALLOWED_IDENTITY_EMAIL_PATTERN.test(
    String(email || '').trim().toLowerCase()
  );
}
