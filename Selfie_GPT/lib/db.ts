import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

export const getOrCreateUser = async (userId: string) => {
  const user = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId }
  });
  return user;
};

export const getOrCreateSession = async (userId: string) => {
  await getOrCreateUser(userId);
  const session = await prisma.session.upsert({
    where: { userId },
    update: {},
    create: { userId, state: 'TOP_MENU' }
  });
  return session;
};

export const setSessionState = async (
  userId: string,
  state: string,
  submenu?: string | null,
  paginationOffset?: number | null
) => {
  return prisma.session.update({
    where: { userId },
    data: {
      state,
      submenu: submenu ?? null,
      ...(typeof paginationOffset === 'number' ? { paginationOffset } : {})
    }
  });
};

export const recordPhoto = async (userId: string, indexNumber: number, originalPath: string, mime: string) => {
  return prisma.photo.upsert({
    where: { userId_indexNumber: { userId, indexNumber } },
    update: { originalPath, mime },
    create: { userId, indexNumber, originalPath, mime }
  });
};

export const recordVariant = async (
  photoId: string,
  mode: number,
  resultPath: string,
  promptText: string
) => prisma.variant.create({ data: { photoId, mode, resultPath, promptText } });

export const recordPromptLog = async (userId: string, category: string, inputText: string, gptSummary: string) =>
  prisma.promptLog.create({ data: { userId, category, inputText, gptSummary } });








