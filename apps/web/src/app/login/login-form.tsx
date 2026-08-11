'use client';

import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { sendMagicLink, signInWithGoogle, type LoginState } from './actions';

const INITIAL: LoginState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Sending…
        </>
      ) : (
        <>
          <Mail aria-hidden />
          Email me a sign-in link
        </>
      )}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(sendMagicLink, INITIAL);

  if (state.status === 'sent') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 aria-hidden className="size-8 text-primary" />
        <h2 className="font-medium">Check your inbox</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If that address can receive mail, a sign-in link is on its way. The link works once and
          expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            aria-invalid={state.status === 'error'}
            aria-describedby={state.status === 'error' ? 'login-error' : undefined}
          />
        </div>

        {state.status === 'error' && (
          <p id="login-error" role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}

        <SubmitButton />
      </form>

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="outline" size="lg" className="w-full">
          <GoogleMark />
          Continue with Google
        </Button>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z"
      />
    </svg>
  );
}
