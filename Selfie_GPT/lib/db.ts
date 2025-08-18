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
    create: { userId, state: 'MENU' }
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








