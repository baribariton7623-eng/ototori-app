import { describe, expect, it } from 'vitest';
import { ResendEmailSender } from '../src/notify/EmailSender.js';

describe('ResendEmailSender', () => {
  it('Resend API に from / to / subject / text を送る', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new ResendEmailSender('re_test', 'レッスン予約 <noreply@example.com>', fakeFetch);
    await sender.send({ to: 'a@example.com', subject: '件名', text: '本文' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      from: 'レッスン予約 <noreply@example.com>',
      to: ['a@example.com'],
      subject: '件名',
      text: '本文',
    });
  });

  it('HTTP エラーは例外にする(呼び出し側の safeNotify で握りつぶされる)', async () => {
    const fakeFetch = (async () => new Response('{"message":"domain not verified"}', { status: 403 })) as unknown as typeof fetch;
    const sender = new ResendEmailSender('re_test', 'x <x@example.com>', fakeFetch);
    await expect(sender.send({ to: 'a@example.com', subject: 's', text: 't' })).rejects.toThrow(/HTTP 403.*domain not verified/);
  });
});
