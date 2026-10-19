import { authResendSecondsRemaining } from '../shared/auth-resend.js';

export class AuthLinkRequestGate {
  private sending = false;

  constructor(
    private readonly readAvailableAt: () => number,
    private readonly now: () => number = Date.now
  ) {}

  async run(send: () => Promise<void>): Promise<void> {
    if (this.sending) throw new Error('A sign-in link is already being sent.');
    const remaining = authResendSecondsRemaining(this.readAvailableAt(), this.now());
    if (remaining > 0) throw new Error(`Wait ${remaining} seconds before requesting another sign-in link.`);
    this.sending = true;
    try { await send(); }
    finally { this.sending = false; }
  }
}
