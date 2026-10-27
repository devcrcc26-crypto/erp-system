import { redirect } from 'next/navigation';

/**
 * `/help` → first guide topic.
 */
export default function HelpRootPage(): never {
  redirect('/help/getting-started');
}
