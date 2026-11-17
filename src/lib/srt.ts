
export type SubtitleEntry = {
  id: number;
  start: string;
  end: string;
  text: string;
};

export function parseSRT(content: string): SubtitleEntry[] {
  const normalized = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!normalized) {
    throw new Error("ไฟล์ SRT ไม่มีข้อมูล");
  }

  const blocks = normalized.split(/\n\s*\n/);
  const entries: SubtitleEntry[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");

    const timeIndex = lines.findIndex((line) =>
      /^\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(line)
    );

    if (timeIndex === -1) continue;

    const match = lines[timeIndex].match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );

    if (!match) continue;

    const text = lines.slice(timeIndex + 1).join("\n").trim();

    if (!text) continue;

    entries.push({
      id: entries.length + 1,
      start: match[1].replace(".", ","),
      end: match[2].replace(".", ","),
      text,
    });
  }

  if (entries.length === 0) {
    throw new Error("ไม่พบรูปแบบซับ SRT ที่ถูกต้อง");
  }

  return entries;
}

export function buildSRT(
  entries: SubtitleEntry[],
  translations: Record<number, string>
): string {
  return entries
    .map((entry, index) => {
      const translated = translations[entry.id] ?? entry.text;

      return [
        index + 1,
        `${entry.start} --> ${entry.end}`,
        translated,
      ].join("\n");
    })
    .join("\n\n");
}
