export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

/** 開発用: 送らずに標準出力へ */
export class ConsoleEmailSender implements EmailSender {
  async send(msg: EmailMessage): Promise<void> {
    console.log(`[mail] to=${msg.to} subject=${msg.subject}\n${msg.text}\n---`);
  }
}

/** テスト用: 送信内容を溜める */
export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failNext = false;
  async send(msg: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated send failure');
    }
    this.sent.push(msg);
  }
  to(address: string): EmailMessage[] {
    return this.sent.filter((m) => m.to === address);
  }
  clear(): void {
    this.sent.length = 0;
  }
}

/**
 * Resend (https://resend.com) の HTTP API。
 * 送信元ドメインは Resend で DNS 認証(SPF/DKIM)済みである必要がある。
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend への送信に失敗しました (HTTP ${res.status}) ${body.slice(0, 300)}`);
    }
  }
}
