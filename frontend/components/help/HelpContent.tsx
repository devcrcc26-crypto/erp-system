'use client';

import type { ReactNode } from 'react';

/**
 * Lightweight markdown renderer (no react-markdown).
 * Supports headings, paragraphs, lists, tables, links, inline code, bold/italic,
 * and `[SCREENSHOT: file.png]` / `![alt](/guide/images/…)` screenshot slots.
 */
export default function HelpContent({
  content,
}: {
  content: string;
}): ReactNode {
  const processed = content.replace(
    /\[SCREENSHOT:\s*([^\]]+)\]/gi,
    (_match, filename: string) =>
      `![screenshot](/guide/images/${filename.trim()})`,
  );

  const blocks = splitBlocks(processed);

  return (
    <div
      className={[
        'help-prose max-w-none text-[15px] leading-relaxed text-slate-700',
        '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900',
        '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900',
        '[&_p]:mb-3 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:mb-1 [&_strong]:font-semibold [&_strong]:text-slate-900',
        '[&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline-offset-2 hover:[&_a]:underline',
        '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm',
        '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse',
        '[&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm',
        '[&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm',
        '[&_hr]:my-8 [&_hr]:border-slate-200',
      ].join(' ')}
    >
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'hr'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'image'; src: string; alt: string };

function splitBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      blocks.push({ type: 'hr', text: '' });
      i += 1;
      continue;
    }

    const imageOnly = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imageOnly) {
      blocks.push({
        type: 'image',
        alt: imageOnly[1] ?? '',
        src: imageOnly[2] ?? '',
      });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2) });
      i += 1;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3) });
      i += 1;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4) });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        tableLines.push((lines[i] ?? '').trim());
        i += 1;
      }
      const parsed = parseTable(tableLines);
      if (parsed) {
        blocks.push(parsed);
      }
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = (lines[i] ?? '').trim();
      if (
        !next ||
        next.startsWith('#') ||
        next.startsWith('|') ||
        next === '---' ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        /^!\[/.test(next)
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push({ type: 'p', text: para.join(' ') });
  }

  return blocks;
}

function parseTable(lines: string[]): Block | null {
  if (lines.length < 2) {
    return null;
  }
  const splitRow = (row: string): string[] =>
    row
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const headers = splitRow(lines[0] ?? '');
  const body = lines.slice(2).map(splitRow);
  return { type: 'table', headers, rows: body };
}

function Block({ block }: { block: Block }): ReactNode {
  switch (block.type) {
    case 'h1':
      return <h1 className="mb-4 text-2xl font-bold text-slate-900">{inline(block.text)}</h1>;
    case 'h2':
      return <h2>{inline(block.text)}</h2>;
    case 'h3':
      return <h3>{inline(block.text)}</h3>;
    case 'p':
      return <p>{inline(block.text)}</p>;
    case 'hr':
      return <hr />;
    case 'ul':
      return (
        <ul>
          {block.items.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol>
          {block.items.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <table>
          <thead>
            <tr>
              {block.headers.map((header, index) => (
                <th key={index}>{inline(header)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{inline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'image':
      return <ScreenshotSlot src={block.src} alt={block.alt} />;
    default:
      return null;
  }
}

function ScreenshotSlot({ src, alt }: { src: string; alt: string }): ReactNode {
  const filename = src.split('/').pop() ?? src;
  return (
    <span
      className="my-4 flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100 text-slate-400"
      role="img"
      aria-label={alt || 'Screenshot coming soon'}
    >
      <span className="p-6 text-center">
        <svg
          className="mx-auto mb-2 h-10 w-10 text-slate-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="block text-xs text-slate-400">
          {alt || 'Screenshot coming soon'}
        </span>
        <span className="mt-0.5 block text-xs text-slate-300">{filename}</span>
      </span>
    </span>
  );
}

/** Inline markdown: `code`, **bold**, *italic*, [label](url). */
function inline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (match[2] && match[3]) {
      nodes.push(
        <a key={key} href={match[3]}>
          {match[2]}
        </a>,
      );
    }
    key += 1;
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}
