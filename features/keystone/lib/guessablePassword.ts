// Words that make up most guessed passwords once digits and symbols are stripped
// ("password12", "Qwerty123!"). Keystone's rejectCommon only matches exact entries.
const COMMON_WORDS = new Set([
  'password', 'passwort', 'passwd', 'pass', 'qwerty', 'qwertyuiop', 'qwertz', 'azerty', 'asdf', 'asdfgh', 'asdfghjkl',
  'zxcvbn', 'zxcvbnm', 'abc', 'abcd', 'abcdef', 'abcdefg', 'abcdefgh', 'letmein', 'welcome', 'admin', 'administrator',
  'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'soccer', 'sunshine', 'princess', 'master', 'hello', 'login',
  'secret', 'changeme', 'trustno', 'starwars', 'superman', 'batman', 'shadow', 'freedom', 'whatever', 'hotel', 'guest',
  'booking', 'test', 'user', 'default',
]);

/** True for a password that is easy to guess even though it is long enough. */
export function guessablePassword(password: string, email?: string | null) {
  const lower = password.toLowerCase();
  if (new Set(lower).size < 5) return true;
  if (/^[\d\s.+()-]+$/.test(lower)) return true;
  const letters = lower.replace(/[^a-z]/g, '');
  if (COMMON_WORDS.has(letters)) return true;
  const mailbox = String(email || '').trim().toLowerCase().split('@')[0].replace(/[^a-z0-9]/g, '');
  return mailbox.length >= 4 && lower.replace(/[^a-z0-9]/g, '').includes(mailbox);
}
