import { Fragment, type ReactNode } from 'react';

/**
 * Safe Markdown for announcement bodies.
 *
 * Builds React elements from a small Markdown subset (headings, paragraphs,
 * lists, quotes, code, rules, bold / italic / strike / inline code, links).
 * It never uses dangerouslySetInnerHTML, so raw HTML such as <script> is
 * shown as plain text and can't run. Links only allow http(s), mailto and
 * in-app paths, and always open in a new tab with noopener.
 */

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const ORDERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s{0,3}```/;

export function parseMarkdownBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ kind: 'heading', level, text: heading[2] });
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index])) {
        quoted.push(QUOTE.exec(lines[index])?.[1] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'quote', lines: quoted });
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (index < lines.length && pattern.test(lines[index])) {
        items.push(pattern.exec(lines[index])?.[1] ?? '');
        index += 1;
        // Indented continuation lines belong to the previous item.
        while (
          index < lines.length &&
          /^\s{2,}\S/.test(lines[index]) &&
          !BULLET.test(lines[index]) &&
          !ORDERED.test(lines[index])
        ) {
          items[items.length - 1] += ` ${lines[index].trim()}`;
          index += 1;
        }
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !QUOTE.test(lines[index]) &&
      !BULLET.test(lines[index]) &&
      !ORDERED.test(lines[index]) &&
      !RULE.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', lines: paragraph });
  }

  return blocks;
}

/** Only these targets become links; anything else renders as text. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^(https?:|mailto:)/i.test(href)) {
    return href;
  }
  if (href.startsWith('/') && !href.startsWith('//')) {
    return href;
  }
  return null;
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+?\*\*|__[^_]+?__)|(~~[^~]+?~~)|(\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) {
      nodes.push(rest.slice(0, match.index));
    }
    const token = match[0];
    const id = `${keyPrefix}-${key}`;
    key += 1;

    if (match[1]) {
      nodes.push(<code key={id}>{token.slice(1, -1)}</code>);
    } else if (match[2]) {
      nodes.push(<strong key={id}>{renderInline(token.slice(2, -2), id)}</strong>);
    } else if (match[3]) {
      nodes.push(<del key={id}>{renderInline(token.slice(2, -2), id)}</del>);
    } else if (match[4]) {
      nodes.push(<em key={id}>{renderInline(token.slice(1, -1), id)}</em>);
    } else if (match[5]) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = link ? safeHref(link[2]) : null;
      nodes.push(
        href && link ? (
          <a key={id} href={href} target="_blank" rel="noopener noreferrer">
            {renderInline(link[1], id)}
          </a>
        ) : (
          <Fragment key={id}>{link ? link[1] : token}</Fragment>
        ),
      );
    } else if (match[6]) {
      nodes.push(
        <a key={id} href={token} target="_blank" rel="noopener noreferrer">
          {token}
        </a>,
      );
    }
    rest = rest.slice(match.index + token.length);
  }

  return nodes;
}

function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      nodes.push(<br key={`${keyPrefix}-br-${index}`} />);
    }
    nodes.push(...renderInline(line, `${keyPrefix}-${index}`));
  });
  return nodes;
}

export default function AnnouncementMarkdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}): ReactNode {
  const blocks = parseMarkdownBlocks(source);
  return (
    <div className={className ? `erp-markdown ${className}` : 'erp-markdown'}>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case 'heading': {
            const Tag = `h${block.level + 1}` as 'h2' | 'h3' | 'h4' | 'h5';
            return <Tag key={key}>{renderInline(block.text, key)}</Tag>;
          }
          case 'paragraph':
            return <p key={key}>{renderLines(block.lines, key)}</p>;
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </List>
            );
          }
          case 'quote':
            return <blockquote key={key}>{renderLines(block.lines, key)}</blockquote>;
          case 'code':
            return (
              <pre key={key}>
                <code>{block.text}</code>
              </pre>
            );
          case 'rule':
            return <hr key={key} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
