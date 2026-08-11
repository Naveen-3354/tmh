'use client';

import { Check, Copy, KeyRound, Loader2, Plug, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { createApiToken, revokeApiToken, type TokenState } from '@/app/actions/tokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { TokenListItem } from '@/lib/queries/tokens';
import { cn } from '@/lib/utils';

const INITIAL: TokenState = { status: 'idle' };

function formatWhen(value: Date | null): string {
  if (!value) return 'never';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value));
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : <KeyRound aria-hidden />}
      Create token
    </Button>
  );
}

export function Connections({ tokens, mcpUrl }: { tokens: TokenListItem[]; mcpUrl: string }) {
  const [state, formAction] = useActionState(createApiToken, INITIAL);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const active = tokens.filter((token) => !token.revokedAt);
  const revoked = tokens.filter((token) => token.revokedAt);

  const claudeConfig = JSON.stringify(
    {
      mcpServers: {
        tmh: {
          command: 'npx',
          args: ['-y', 'mcp-remote', mcpUrl, '--header', 'Authorization: Bearer YOUR_TOKEN'],
        },
      },
    },
    null,
    2,
  );

  return (
    <section
      aria-labelledby="connections-heading"
      className="mt-4 rounded-xl border border-border bg-card p-5"
    >
      <h2 id="connections-heading" className="flex items-center gap-2 font-medium tracking-tight">
        <Plug aria-hidden className="size-4 text-primary" />
        Connections
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Personal access tokens let an MCP client — Claude Desktop, an IDE, anything that speaks the
        protocol — read and write this data on your behalf. A token carries exactly your own
        permissions and nothing more, and you can revoke it at any time.
      </p>

      {state.status === 'created' && state.token && (
        <div role="status" className="mt-4 rounded-lg border border-primary/40 bg-accent/40 p-4">
          <p className="text-sm font-medium">Your new token</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Copy it now — it is stored only as a hash and cannot be shown again.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-xs">
              {state.token}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(state.token as string, 'new')}
            >
              {copied === 'new' ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied === 'new' ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <Label htmlFor="token-name">Name</Label>
          <Input
            id="token-name"
            name="name"
            placeholder="Claude Desktop"
            required
            maxLength={60}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="token-expiry">Expires</Label>
          <Select id="token-expiry" name="expiresInDays" defaultValue="90" className="mt-1.5">
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
            <option value="0">Never</option>
          </Select>
        </div>
        <CreateButton />
      </form>

      {state.status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      {active.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {active.map((token) => {
            const expired = token.expiresAt && new Date(token.expiresAt) < new Date();
            return (
              <li
                key={token.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {token.name}
                    {expired && (
                      <span className="ml-2 text-xs font-normal text-warning">expired</span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {token.prefix}… · last used {formatWhen(token.lastUsedAt)} · expires{' '}
                    {token.expiresAt ? formatWhen(token.expiresAt) : 'never'}
                  </span>
                </span>
                <form action={revokeApiToken}>
                  <input type="hidden" name="id" value={token.id} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    aria-label={`Revoke ${token.name}`}
                  >
                    <Trash2 aria-hidden />
                    Revoke
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {active.length === 0 && (
        <p className="mt-5 text-sm text-muted-foreground">No active tokens.</p>
      )}

      {revoked.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {revoked.length} revoked
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {revoked.map((token) => (
              <li key={token.id} className="font-mono text-xs text-muted-foreground line-through">
                {token.name} · {token.prefix}…
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-medium">Connect a client</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Endpoint (Streamable HTTP):
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-xs">
            {mcpUrl}
          </code>
          <Button type="button" size="sm" variant="outline" onClick={() => copy(mcpUrl, 'url')}>
            {copied === 'url' ? <Check aria-hidden /> : <Copy aria-hidden />}
          </Button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Claude Desktop config — replace <code>YOUR_TOKEN</code> with the value above:
        </p>
        <div className="mt-2 flex items-start gap-2">
          <pre
            className={cn(
              'min-w-0 flex-1 overflow-x-auto rounded-md bg-background p-3 font-mono text-xs',
            )}
          >
            {claudeConfig}
          </pre>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copy(claudeConfig, 'config')}
          >
            {copied === 'config' ? <Check aria-hidden /> : <Copy aria-hidden />}
          </Button>
        </div>
      </div>
    </section>
  );
}
