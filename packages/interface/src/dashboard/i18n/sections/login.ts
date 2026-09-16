export interface LoginStrings {
  title: string;
  passwordLabel: string;
  submit: string;
  submitting: string;
  errorInvalid: string;
  /** {wait} is replaced with a human duration built from the server's
   *  retryAfterSeconds by the page. */
  errorLocked: string;
  /** Unit strings of the {wait} duration, same placeholder style as
   *  common.relativeTime. */
  waitMinutes: string;
  waitMinutesSeconds: string;
  waitSeconds: string;
  /** Shown when the server runs without a password configured. */
  errorNotConfigured: string;
  errorNetwork: string;
}

export const login = {
  fr: {
    title: 'Connexion',
    passwordLabel: 'Mot de passe',
    submit: 'Se connecter',
    submitting: 'Connexion…',
    errorInvalid: 'Mot de passe incorrect.',
    errorLocked: 'Trop de tentatives échouées. Réessayez dans {wait}.',
    waitMinutes: '{minutes} min',
    waitMinutesSeconds: '{minutes} min {seconds} s',
    waitSeconds: '{seconds} s',
    errorNotConfigured: 'Cette console fonctionne actuellement sans mot de passe.',
    errorNetwork: 'Impossible de joindre le serveur. Réessayez.',
  },
  en: {
    title: 'Sign in',
    passwordLabel: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    errorInvalid: 'Incorrect password.',
    errorLocked: 'Too many failed attempts. Try again in {wait}.',
    waitMinutes: '{minutes} min',
    waitMinutesSeconds: '{minutes} min {seconds} s',
    waitSeconds: '{seconds} s',
    errorNotConfigured: 'This dashboard currently runs without a password.',
    errorNetwork: 'Could not reach the server. Try again.',
  },
} satisfies { fr: LoginStrings; en: LoginStrings };
