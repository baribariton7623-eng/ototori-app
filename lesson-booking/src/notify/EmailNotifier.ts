import type { EmailMessage, EmailSender } from './EmailSender.js';
import type { Notifier } from './Notifier.js';
import {
  bookingChangedMails,
  bookingCreatedMails,
  cancelledByHostMails,
  changeDecidedMails,
  changeRequestedMails,
  feePaidMails,
  lessonReminderMails,
  type TemplateContext,
} from './templates.js';

/** Notifier のメール実装。1 通の失敗で他の宛先への送信を止めない */
export class EmailNotifier implements Notifier {
  constructor(
    private readonly sender: EmailSender,
    private readonly ctx: TemplateContext,
  ) {}

  bookingCreated: Notifier['bookingCreated'] = async (e) =>
    this.sendAll(bookingCreatedMails(this.ctx, e.host, e.student, e.booking));

  bookingChanged: Notifier['bookingChanged'] = async (e) =>
    this.sendAll(bookingChangedMails(this.ctx, e.host, e.student, e.kind, e.before, e.after));

  changeRequested: Notifier['changeRequested'] = async (e) =>
    this.sendAll(changeRequestedMails(this.ctx, e.host, e.student, e.request, e.booking));

  changeDecided: Notifier['changeDecided'] = async (e) =>
    this.sendAll(changeDecidedMails(this.ctx, e.host, e.student, e.request, e.before, e.after));

  cancelledByHost: Notifier['cancelledByHost'] = async (e) =>
    this.sendAll(cancelledByHostMails(this.ctx, e.host, e.student, e.booking, e.reason));

  lessonReminder: Notifier['lessonReminder'] = async (e) =>
    this.sendAll(lessonReminderMails(this.ctx, e.host, e.student, e.booking));

  feePaid: Notifier['feePaid'] = async (e) => this.sendAll(feePaidMails(this.ctx, e.host, e.student, e.booking));

  private async sendAll(messages: EmailMessage[]): Promise<void> {
    const results = await Promise.allSettled(messages.map((m) => this.sender.send(m)));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      throw new AggregateError(
        failed.map((f) => f.reason),
        `${failed.length}/${messages.length} 通のメール送信に失敗しました`,
      );
    }
  }
}
