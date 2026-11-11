import { redirect } from 'next/navigation';

/** Legacy attendance-nested path → canonical `/hr/work-from-home`. */
export default function WorkFromHomeDaysLegacyRedirect(): never {
  redirect('/hr/work-from-home');
}
