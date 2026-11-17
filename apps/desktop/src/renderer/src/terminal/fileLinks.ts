import type { IBufferLine, ILink, Terminal } from '@xterm/xterm';

function columnAt(line: IBufferLine, offset: number): number {
  let index = 0;
  for (let column = 0; column < line.length; column++) {
    const cell = line.getCell(column);
    if (!cell || cell.getWidth() === 0) continue;
    index += cell.getChars().length || 1;
    if (index > offset) return column + 1;
  }
  return line.length;
}

export function registerFileLinks(terminal: Terminal, openFile: (path: string) => void): void {
  terminal.registerLinkProvider({
    provideLinks(row, callback) {
      const line = terminal.buffer.active.getLine(row - 1);
      if (!line) return callback(undefined);

      const links: ILink[] = [];
      const tokens = /"([^"]+)"|'([^']+)'|[^\s"'<>|]+/g;
      for (const match of line.translateToString(true).matchAll(tokens)) {
        const label = match[1] ?? match[2] ?? match[0].replace(/[),;]+$/, '');
        const file = label.replace(/:\d+(?::\d+)?$/, '');
        if (
          file.includes('://') ||
          (!file.includes('/') && !file.includes('\\') && !/\.[\w-]+$/.test(file))
        ) {
          continue;
        }
        const from = match.index + (match[1] || match[2] ? 1 : 0);
        links.push({
          text: label,
          range: {
            start: { x: columnAt(line, from), y: row },
            end: { x: columnAt(line, from + label.length - 1), y: row },
          },
          activate: () => openFile(file),
        });
      }
      callback(links.length ? links : undefined);
    },
  });
}
