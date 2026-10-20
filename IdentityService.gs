const ALLOWED_IDENTITY_EMAIL_PATTERN = /^[^@\s]+@croix-rouge\.fr$/i;

function getActiveUserEmail_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function isAllowedIdentityEmail_(email) {
  return ALLOWED_IDENTITY_EMAIL_PATTERN.test(
    String(email || '').trim().toLowerCase()
  );
}
