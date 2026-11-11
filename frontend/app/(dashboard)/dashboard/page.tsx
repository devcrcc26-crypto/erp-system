import { redirect } from 'next/navigation';

/** Shell dashboard lives at `/`; this path is used by PM middleware redirects. */
export default function DashboardAliasPage(): never {
  redirect('/');
}
