'use client';
import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { PeopleView } from '@/components/app/people-view';
import { StagesDialog } from '@/components/app/stages-dialog';
import { Button, ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';

export default function PipelinePage() {
  const [stages, setStages] = useState(false);
  return (
    <>
      <PeopleView
        defaultView="kanban"
        toolbar={
          <Button size="compact" onClick={() => setStages(true)}>
            <Settings2 size={16} strokeWidth={1.5} /> Stages
          </Button>
        }
        empty={
          <EmptyState
            title="Your pipeline is empty"
            description="Reveal contacts from the database and they land in New. Call outcomes move them along automatically."
            action={
              <ButtonLink variant="primary" href="/app/leads">
                Add from database
              </ButtonLink>
            }
          />
        }
      />
      <StagesDialog open={stages} onClose={() => setStages(false)} />
    </>
  );
}
