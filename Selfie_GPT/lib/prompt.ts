import fs from 'fs/promises';
import path from 'path';

const loadTemplate = async (name: 'realism' | 'stylize' | 'scene') => {
  const p = path.join(process.cwd(), 'prompts', `${name}.md`);
  return fs.readFile(p, 'utf8');
};

const render = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{\{(.*?)\}\}/g, (_, k) => vars[k.trim()] ?? '');

export const buildPrompt = async (type: 'realism' | 'stylize' | 'scene', userText: string) => {
  const tpl = await loadTemplate(type);
  return render(tpl, { user_text: userText });
};








