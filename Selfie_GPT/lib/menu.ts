export const MAIN_MENU = {
  SELFIE: 1,
  YXO: 2,
  BOT3: 3
} as const;

export const isCommand = (text: string, cmd: string) => text.trim().toLowerCase() === cmd.toLowerCase();





