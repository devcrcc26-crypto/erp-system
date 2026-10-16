/**
 * Dev/staging demo login only. Never import from production entry points -
 * load via DemoLoginPanel (dynamic import behind NEXT_PUBLIC_ENABLE_DEMO_LOGIN).
 */
export const DEMO_PASSWORD = 'Admin@12345';

export interface DemoLoginAccount {
  readonly email: string;
  readonly role: string;
  readonly name: string;
  readonly highlight?: string;
  /** When omitted, `DEMO_PASSWORD` is used. */
  readonly password?: string;
}

/**
 * Resolves the login password for a demo account.
 */
export function demoAccountPassword(account: DemoLoginAccount): string {
  return account.password ?? DEMO_PASSWORD;
}

/** Demo accounts shown on the login page. */
export const DEMO_LOGIN_ACCOUNTS: DemoLoginAccount[] = [
  {
    email: 'eyuel.tilahun@company.local',
    role: 'Employee',
    name: 'Eyuel Tilahun',
  },
  {
    email: 'xiaoming.li@company.local',
    role: 'Discipline Leader',
    name: 'Xiaoming Li',
  },
  {
    email: 'jinxia.dong@company.local',
    role: 'HR Manager',
    name: 'Jinxia Dong',
  },
];
