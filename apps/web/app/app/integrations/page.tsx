// Integrations live in Settings now.
import { redirect } from 'next/navigation';

export default function IntegrationsRedirect() {
  redirect('/app/settings/integrations');
}
