const MEDALS = ["🥇", "🥈", "🥉"];

interface RankingText {
  heading: string;
  title: string;
  pagination: string;
  footer: string;
  offset: number;
  rows: { name: string; value: string }[];
}

export function formatRankingPage({
  heading,
  title,
  pagination,
  footer,
  offset,
  rows,
}: RankingText): string {
  const header = `╭〔 ${heading} 〕⬣\n┃ 🏆 ${title}\n┃ 📄 ${pagination}\n╰━━━━━━━━━━━━⬣\n\n`;
  const entries = rows
    .map(
      ({ name, value }, index) =>
        `┃ ${MEDALS[offset + index] ?? "🎖️"} ${name}\n┃ ${value}\n\n`,
    )
    .join("");
  return `${header}${entries}╰〔 ⚡ ${footer} ⚡ 〕⬣`;
}
