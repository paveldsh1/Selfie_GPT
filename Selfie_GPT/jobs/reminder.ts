import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../lib/db';
import { logger } from '../lib/logger';
import { sendText } from '../lib/greenapi';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

export type ReminderKind =
  | 'TOP_MENU'
  | 'MENU'
  | 'DETAIL'
  | 'DESC'
  | 'RESULT_MENU';

export type ReminderJob = {
  phoneId: string;
  kind: ReminderKind;
  stateSnapshot: string;
  submenuSnapshot?: string | null;
  menuText: string;
  scheduledAt: number;
};

export const reminderQueue = new Queue<ReminderJob>('reminders', { connection });

export const scheduleReminder = async (
  args: {
    phoneId: string;
    kind: ReminderKind;
    stateSnapshot: string;
    submenuSnapshot?: string | null;
    menuText: string;
    delayMs: number;
  }
) => {
  const scheduledAt = Date.now();
  const jobId = `${args.phoneId}:${args.kind}:${scheduledAt}`;
  await reminderQueue.add(
    'remind',
    {
      phoneId: args.phoneId,
      kind: args.kind,
      stateSnapshot: args.stateSnapshot,
      submenuSnapshot: args.submenuSnapshot ?? null,
      menuText: args.menuText,
      scheduledAt
    },
    {
      delay: Math.max(0, args.delayMs),
      jobId,
      removeOnComplete: true,
      removeOnFail: true
    }
  );
};

new Worker<ReminderJob>(
  'reminders',
  async (job) => {
    const { phoneId, stateSnapshot, submenuSnapshot, scheduledAt, menuText, kind } = job.data;
    try {
      const session = await prisma.session.findUnique({ where: { userId: phoneId } });
      if (!session) return;

      // If user progressed (state or submenu changed) or any update happened after scheduling — skip
      if (session.state !== stateSnapshot) return;
      if (typeof submenuSnapshot !== 'undefined' && submenuSnapshot !== session.submenu) return;
      // Любая активность после планирования отменяет напоминание
      const updatedAtMs = new Date(session.updatedAt).getTime();
      if (updatedAtMs > scheduledAt + 1000) return;
      const lastTextMs = session.lastTextAt ? new Date(session.lastTextAt).getTime() : 0;
      // Грейс-окно: если пользователь писал в пределах 10 секунд ДО срабатывания, не напоминаем
      if (lastTextMs && lastTextMs >= scheduledAt - 10000) return;

      logger.warn({ phoneId, kind }, 'reminder: no reply detected — sending prompt again');
      await sendText(phoneId, 'Your reply has not reached us, please repeat');
      if (menuText) {
        await sendText(phoneId, menuText);
      }
    } catch (e) {
      logger.error({ e: String(e) }, 'reminder worker error');
    }
  },
  { connection }
);


