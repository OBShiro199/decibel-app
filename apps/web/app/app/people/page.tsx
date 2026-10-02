import { redirect } from 'next/navigation';

// The People tab was removed; calls are the place to work people from now.
export default function Page() {
  redirect('/app/calls');
}
