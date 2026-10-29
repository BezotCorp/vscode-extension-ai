import { MAX_FILE_CHARS } from './workspace_limits';

export type TruncatedText = {
  text: string;
  truncated: boolean;
  originalLength: number;
};

export function truncateText(content: string, maxChars = MAX_FILE_CHARS): TruncatedText {
  if (content.length <= maxChars) {
    return { text: content, truncated: false, originalLength: content.length };
  }

  return {
    text: `${content.slice(0, maxChars)}\n\n/* Content truncated by BezotCorp AI */`,
    truncated: true,
    originalLength: content.length,
  };
}

export function truncateContent(content: string): string {
  return truncateText(content).text;
}
