'use client';

import { AlertTriangle, Loader2, Upload } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  deleteAccount,
  deleteAllLogs,
  importCsv,
  type DeleteState,
  type ImportState,
} from '@/app/actions/data';
import { IMPORTABLE_TYPES } from '@tmh/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const IMPORT_INITIAL: ImportState = { status: 'idle' };
const DELETE_INITIAL: DeleteState = { status: 'idle' };

function Submitting({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <>
      {pending && <Loader2 aria-hidden className="animate-spin" />}
      {children}
    </>
  );
}

export function ImportForm() {
  const [state, formAction] = useActionState(importCsv, IMPORT_INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="import-type">What kind of data?</Label>
        <Select id="import-type" name="type" defaultValue="water" className="mt-1.5">
          {IMPORTABLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="import-file">CSV file</Label>
        <Input
          id="import-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="mt-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm"
        />
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Column names are matched loosely, so a file exported from here imports straight back. Rows
          that fail validation are reported and skipped — the rest still import.
        </p>
      </div>

      <Button type="submit" variant="outline">
        <Submitting>
          <Upload aria-hidden />
          Import
        </Submitting>
      </Button>

      {state.status === 'done' && (
        <div role="status" className="text-sm">
          <p className="font-medium text-primary">Imported {state.imported} rows.</p>
          {state.skipped && state.skipped.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {state.skipped.length} rows skipped
              </summary>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                {state.skipped.map((row) => (
                  <li key={row.line}>
                    Line {row.line}: {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {state.status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function DangerZone() {
  const [logsState, deleteLogsAction] = useActionState(deleteAllLogs, DELETE_INITIAL);
  const [accountState, deleteAccountAction] = useActionState(deleteAccount, DELETE_INITIAL);

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-destructive/40 p-5">
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <h2 className="font-medium tracking-tight">Delete data</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Both actions are immediate and cannot be undone. Export first if you might want the data
            back.
          </p>
        </div>
      </div>

      <form action={deleteLogsAction} className="flex flex-col gap-2">
        <Label htmlFor="confirm-logs">
          Delete all logs, keep the account — type <code>DELETE</code>
        </Label>
        <div className="flex gap-2">
          <Input id="confirm-logs" name="confirm" placeholder="DELETE" autoComplete="off" />
          <Button type="submit" variant="outline">
            <Submitting>Delete logs</Submitting>
          </Button>
        </div>
        {logsState.status === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            {logsState.message}
          </p>
        )}
      </form>

      <form action={deleteAccountAction} className="flex flex-col gap-2">
        <Label htmlFor="confirm-account">
          Delete the account and everything in it — type <code>DELETE</code>
        </Label>
        <div className="flex gap-2">
          <Input id="confirm-account" name="confirm" placeholder="DELETE" autoComplete="off" />
          <Button type="submit" variant="destructive">
            <Submitting>Delete account</Submitting>
          </Button>
        </div>
        {accountState.status === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            {accountState.message}
          </p>
        )}
      </form>
    </div>
  );
}
