'use client';
import { useParams } from 'next/navigation';
import P0 from '@/app/app/settings/appearance/page';
import P1 from '@/app/app/settings/audio/page';
import P2 from '@/app/app/settings/billing/page';
import P3 from '@/app/app/settings/calling/page';
import P4 from '@/app/app/settings/compliance/page';
import P5 from '@/app/app/settings/data/page';
import P6 from '@/app/app/settings/developers/page';
import P7 from '@/app/app/settings/general/page';
import P8 from '@/app/app/settings/members/page';
import P9 from '@/app/app/settings/notifications/page';
import P10 from '@/app/app/settings/phone-numbers/page';
import P11 from '@/app/app/settings/plans/page';
import P12 from '@/app/app/settings/profile/page';
import P13 from '@/app/app/settings/security/page';
import P14 from '@/app/app/settings/sessions/page';

const PAGES: Record<string, React.ComponentType> = { 'appearance': P0, 'audio': P1, 'billing': P2, 'calling': P3, 'compliance': P4, 'data': P5, 'developers': P6, 'general': P7, 'members': P8, 'notifications': P9, 'phone-numbers': P10, 'plans': P11, 'profile': P12, 'security': P13, 'sessions': P14 };

export default function Page() {
  const { page } = useParams<{ page: string }>();
  const C = PAGES[page] ?? P0;
  return <C />;
}
