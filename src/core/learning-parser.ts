export interface LearningEntry {
  timestamp: string;
  category: string;
  content: string;
}

export function parseLearningEntries(content: string): LearningEntry[] {
  const sections = content
    .split('\n---')
    .map((section) => section.trim())
    .filter((section) => section.startsWith('## '));
  const parsed: LearningEntry[] = [];
  for (const section of sections) {
    const lines = section.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;
    const header = lines[0].replace(/^##\s+/, '');
    const match = header.match(/^(.+?)\s+-\s+(.+)$/);
    if (!match) continue;
    parsed.push({
      timestamp: match[1].trim(),
      category: match[2].trim(),
      content: lines.slice(1).join('\n').trim(),
    });
  }
  return parsed;
}
