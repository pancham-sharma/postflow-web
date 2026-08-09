// Client-safe auth messaging helpers. Deliberately generic so responses never
// reveal whether an email or username exists (no enumeration), and password
// rules are checked before we ever hit the network.

export const GENERIC_LOGIN_ERROR = "Invalid email or password.";
export const GENERIC_SIGNUP_ERROR =
  "We couldn't complete your sign-up. Check your details and try again.";

/** Very common / breached passwords we refuse outright. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "letmein123",
  "welcome123",
  "iloveyou",
  "admin123",
  "postflow123",
  "changeme123",
  "abc12345",
]);

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** Returns an error string, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters — passphrases are fine.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return "That password is too long.";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common. Choose something unique.";
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (classes < 3 && password.length < 16) {
    return "Mix upper and lower case, numbers or symbols — or use a longer passphrase.";
  }
  return null;
}

/** Normalises an email for consistent comparison and storage. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "throwawaymail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@")[1];
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}
