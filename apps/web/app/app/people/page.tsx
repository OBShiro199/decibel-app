'use client';
import { Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { ImportCsvDialog } from '@/components/app/import-csv';
import { PeopleView } from '@/components/app/people-view';
import { AddPersonDialog } from '@/components/app/records';
import { Button, ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';

export default function PeoplePage() {
  const [add, setAdd] = useState(false);
  const [importing, setImporting] = useState(false);
  return (
    <>
      <PeopleView
        toolbar={
          <>
            <Button size="compact" onClick={() => setImporting(true)}>
              <Upload size={16} strokeWidth={1.5} /> Import CSV
            </Button>
            <Button size="compact" variant="primary" onClick={() => setAdd(true)}>
              <Plus size={16} strokeWidth={1.5} /> Add person
            </Button>
          </>
        }
        empty={
          <EmptyState
            title="No people yet"
            description="People are your own records: contacts you reveal from the database, import from a CSV or add by hand."
            action={
              <>
                <ButtonLink variant="primary" href="/app/leads">
                  Add from database
                </ButtonLink>
                <Button onClick={() => setImporting(true)}>Import CSV</Button>
              </>
            }
          />
        }
      />
      <AddPersonDialog open={add} onClose={() => setAdd(false)} />
      <ImportCsvDialog open={importing} onClose={() => setImporting(false)} />
    </>
  );
}
