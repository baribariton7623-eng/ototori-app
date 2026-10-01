import type { Host, Student } from '../shared/types.js';
import type { Notifier } from '../notify/Notifier.js';
import type { Clock } from '../repo/InMemoryRepositories.js';
import type { Repositories } from '../repo/Repository.js';

export interface ReminderRunResult {
  checked: number;
  sent: number;
  failed: number;
}

/**
 * 前日リマインド。
 * 定期実行(外部 cron が POST /internal/cron/reminders を叩く、またはサーバー内タイマー)で呼ばれ、
 * 今から hoursBefore 時間以内に始まる確定予約のうち未送信のものに 1 回だけ送る。
 * 実行間隔が空いても取りこぼさないよう「今〜hoursBefore 時間後」の全件を対象にする。
 */
export class ReminderService {
  constructor(
    private readonly repos: Repositories,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
    private readonly hoursBefore = 24,
  ) {}

  async runOnce(): Promise<ReminderRunResult> {
    const now = this.clock.now();
    const until = new Date(now.getTime() + this.hoursBefore * 3_600_000);
    const due = await this.repos.bookings.listDueForReminder(now, until);
    const hosts = new Map<string, Host | null>();
    const students = new Map<string, Student | null>();
    let sent = 0;
    let failed = 0;

    for (const b of due) {
      if (!hosts.has(b.hostId)) hosts.set(b.hostId, await this.repos.hosts.findById(b.hostId));
      if (!students.has(b.studentId)) students.set(b.studentId, await this.repos.students.findById(b.studentId));
      const host = hosts.get(b.hostId);
      const student = students.get(b.studentId);
      if (!host || !student) continue;
      try {
        await this.notifier.lessonReminder({ host, student, booking: b });
        await this.repos.bookings.update(b.id, { reminderSentAt: now.toISOString() });
        sent++;
      } catch (e) {
        // 次回の実行で再試行される(reminderSentAt が null のまま)
        failed++;
        console.error('[reminder] 送信に失敗しました', b.id, e);
      }
    }
    return { checked: due.length, sent, failed };
  }
}
