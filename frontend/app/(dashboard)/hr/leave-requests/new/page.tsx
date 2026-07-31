import { redirect } from 'next/navigation';

/** Legacy /new route — create flow is a drawer on the list page. */
export default function Page(): never {
  redirect('/hr/leave-requests');
}
