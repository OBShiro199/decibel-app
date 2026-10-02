import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <EmptyState shape="diamond" title="Page not found" description="That page does not exist or has moved." action={<ButtonLink variant="primary" href="/">Back to Decibel</ButtonLink>} />
    </div>
  );
}
