import fs from 'fs';
import path from 'path';

export type HelpLang = 'en' | 'zh';

/**
 * Reads a guide markdown file from `public/guide/{lang}/{slug}.md`.
 * Falls back to English, then a short “coming soon” stub.
 */
export function getGuideContent(slug: string, lang: HelpLang): string {
  const guideRoot = path.join(process.cwd(), 'public', 'guide');
  const preferred = path.join(guideRoot, lang, `${slug}.md`);
  try {
    return fs.readFileSync(preferred, 'utf-8');
  } catch {
    if (lang === 'zh') {
      try {
        return fs.readFileSync(
          path.join(guideRoot, 'en', `${slug}.md`),
          'utf-8',
        );
      } catch {
        /* fall through */
      }
    }
    return `# Content coming soon\n\n内容即将发布。\n`;
  }
}

export function getGuideContentPair(slug: string): {
  contentEn: string;
  contentZh: string;
} {
  return {
    contentEn: getGuideContent(slug, 'en'),
    contentZh: getGuideContent(slug, 'zh'),
  };
}
