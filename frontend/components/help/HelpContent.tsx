'use client';

import { useMemo, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ListChecks,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { filterGuideByRole } from '@/lib/help/filter-guide-by-role';
import {
  resolveHelpRoleGroup,
  type RoleGroup,
} from '@/lib/help/modules';
import { getNavIcon } from '@/lib/navigation/nav-icons';
import { useCurrentUser } from '@/lib/query/profile';

/**
 * Lightweight markdown renderer for the user guide (no react-markdown).
 *
 * Guides stay plain markdown; this lays them out as ERP cards:
 * - a header card with the topic icon, title, opening paragraph and an
 *   "On this page" row of section links
 * - the blocks before the first section as overview cards, split at each
 *   `**Label**` line ("Who does what", "Where to find it")
 * - one card per `## Heading` section
 * - `> **What happens next:** …` callouts, toned by their opening label
 * - `1.` numbered steps and nested `-` lists
 * - a line that is only `**Label**` becomes a section label
 * - a line that is only `*(HR only)*` becomes an audience pill
 * - tables, links, inline code, bold/italic
 * - `<!-- role: HR -->…<!-- /role -->` blocks are kept only for matching roles
 */
export default function HelpContent({
  content,
  title,
  iconKey,
  roleGroup: roleGroupProp,
}: {
  content: string;
  /** Article title for the header card. */
  title?: string;
  /** Sidebar icon key of the topic, shown beside the title. */
  iconKey?: string;
  /**
   * Override the viewer’s help role group (tests). When omitted, resolved from
   * the signed-in user’s roles / HR capability.
   */
  roleGroup?: RoleGroup;
}): ReactNode {
  const { locale } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const profileQuery = useCurrentUser();
  const roleGroup = useMemo((): RoleGroup => {
    if (roleGroupProp) {
      return roleGroupProp;
    }
    const roleNames = (profileQuery.data?.roles ?? []).map((role) => role.name);
    return resolveHelpRoleGroup(roleNames, canViewHr);
  }, [roleGroupProp, profileQuery.data?.roles, canViewHr]);

  const processed = filterGuideByRole(content, roleGroup);

  const { lead, overview, sections } = layoutArticle(
    parseBlocks(processed.replace(/\r\n/g, '\n').split('\n'), { next: 0 }),
  );

  return (
    <article className="flex flex-col gap-4 text-[14px] leading-7 text-[rgba(0,0,0,0.75)]">
      {title || lead ? (
        <header className="erp-pro-card px-6 py-5">
          <div className="flex items-start gap-4">
            {iconKey ? (
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E1F5EE] text-[22px] text-[#0F6E56]"
                aria-hidden
              >
                {getNavIcon(iconKey)}
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? (
                <h1 className="m-0 text-[20px] font-semibold leading-8 text-[rgba(0,0,0,0.88)]">
                  {title}
                </h1>
              ) : null}
              {lead ? (
                <p className="mb-0 mt-1 text-[14px] leading-6 text-[rgba(0,0,0,0.65)]">
                  {inline(lead)}
                </p>
              ) : null}
            </div>
          </div>
          {sections.length >= 3 ? (
            <SectionIndex
              sections={sections.map((section) => section.heading)}
              title={locale === 'zh' ? '本页内容' : 'On this page'}
            />
          ) : null}
        </header>
      ) : null}

      {overview.length > 0 ? (
        <div
          className={
            overview.length === 2
              ? 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
              : 'flex flex-col gap-4'
          }
        >
          {overview.map((group, index) => (
            <section key={index} className="erp-employee-section">
              {group.label ? (
                <div className="erp-employee-section-header">
                  <h2 className="erp-employee-section-title">{plainText(group.label)}</h2>
                </div>
              ) : null}
              <div className="erp-employee-section-body [&>*:last-child]:mb-0">
                {group.blocks.map((block, blockIndex) => (
                  <BlockView key={blockIndex} block={block} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {sections.map((section) => (
        <section
          key={section.heading.id}
          id={section.heading.id}
          aria-labelledby={`${section.heading.id}-title`}
          className="erp-employee-section scroll-mt-4"
        >
          <div className="erp-employee-section-header !justify-start gap-2.5">
            <span className="h-4 w-1 shrink-0 rounded-full bg-[#1D9E75]" aria-hidden />
            <h2
              id={`${section.heading.id}-title`}
              className="m-0 text-[15px] font-semibold leading-6 text-[rgba(0,0,0,0.88)]"
            >
              {inline(section.heading.text)}
            </h2>
          </div>
          <div className="erp-employee-section-body [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {section.blocks.map((block, index) => (
              <BlockView key={index} block={block} />
            ))}
          </div>
        </section>
      ))}
    </article>
  );
}

interface ArticleLayout {
  /** The opening paragraph, shown under the title. */
  lead: string | null;
  /** Blocks before the first section, split at each `**Label**` line. */
  overview: { label: string | null; blocks: Block[] }[];
  /** One card per `## Heading`. */
  sections: { heading: HeadingBlock; blocks: Block[] }[];
}

/** Splits parsed blocks into header, overview cards and section cards. */
function layoutArticle(blocks: readonly Block[]): ArticleLayout {
  const layout: ArticleLayout = { lead: null, overview: [], sections: [] };
  let rest = blocks;
  const first = rest[0];
  if (first?.type === 'p') {
    layout.lead = first.text;
    rest = rest.slice(1);
  }

  for (const block of rest) {
    // Cards replace the `---` separators between parts of a guide.
    if (block.type === 'hr' || block.type === 'h1') {
      continue;
    }
    if (block.type === 'h2') {
      layout.sections.push({ heading: block, blocks: [] });
      continue;
    }
    const section = layout.sections[layout.sections.length - 1];
    if (section) {
      section.blocks.push(block);
      continue;
    }
    if (block.type === 'label') {
      layout.overview.push({ label: block.text, blocks: [] });
      continue;
    }
    const group = layout.overview[layout.overview.length - 1];
    if (group) {
      group.blocks.push(block);
    } else {
      layout.overview.push({ label: null, blocks: [block] });
    }
  }

  layout.overview = layout.overview.filter((group) => group.blocks.length > 0);
  return layout;
}

// ── Parsing ──────────────────────────────────────────────────────────────

type Tone = 'success' | 'info' | 'warning' | 'neutral';

interface HeadingBlock {
  type: 'h1' | 'h2' | 'h3';
  text: string;
  id: string;
}

interface ListItem {
  text: string;
  children: Block[];
}

type Block =
  | HeadingBlock
  | { type: 'p' | 'lead' | 'label' | 'audience'; text: string }
  | { type: 'hr' }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'callout'; tone: Tone; blocks: Block[] };

const LIST_MARKER = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isOrderedMarker(marker: string): boolean {
  return /\d/.test(marker);
}

/** Lines that end a paragraph because another block starts. */
function startsBlock(trimmed: string): boolean {
  return (
    trimmed === '' ||
    trimmed === '---' ||
    trimmed === '***' ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('|') ||
    trimmed.startsWith('>') ||
    LIST_MARKER.test(trimmed)
  );
}

/** `ids` is shared across nested calls so heading anchors stay unique. */
function parseBlocks(lines: string[], ids: { next: number }): Block[] {
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
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      ids.next += 1;
      blocks.push({
        type: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3',
        text: heading[2] ?? '',
        id: `section-${ids.next}`,
      });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const inner: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        inner.push((lines[i] ?? '').trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const innerBlocks = parseBlocks(inner, ids);
      blocks.push({
        type: 'callout',
        tone: calloutTone(innerBlocks),
        blocks: innerBlocks,
      });
      continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        tableLines.push((lines[i] ?? '').trim());
        i += 1;
      }
      const table = parseTable(tableLines);
      if (table) {
        blocks.push(table);
      }
      continue;
    }

    if (LIST_MARKER.test(line)) {
      const { block, next } = parseList(lines, i, ids);
      blocks.push(block);
      i = next;
      continue;
    }

    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length && !startsBlock((lines[i] ?? '').trim())) {
      para.push((lines[i] ?? '').trim());
      i += 1;
    }
    blocks.push(classifyParagraph(para.join(' ')));
  }

  return blocks;
}

/**
 * One list at the indentation of `lines[start]`. More-indented lines belong to
 * the previous item and are parsed as its own blocks (nested lists, notes).
 */
function parseList(
  lines: string[],
  start: number,
  ids: { next: number },
): { block: Block; next: number } {
  const first = LIST_MARKER.exec(lines[start] ?? '');
  const baseIndent = (first?.[1] ?? '').length;
  const ordered = isOrderedMarker(first?.[2] ?? '');
  const items: ListItem[] = [];
  let i = start;

  const nextNonBlank = (from: number): number => {
    let j = from;
    while (j < lines.length && !(lines[j] ?? '').trim()) {
      j += 1;
    }
    return j;
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (!line.trim()) {
      // A blank line only continues the list if indented content or a sibling follows.
      const j = nextNonBlank(i + 1);
      const following = lines[j];
      if (following === undefined) {
        break;
      }
      const marker = LIST_MARKER.exec(following);
      const sibling =
        marker !== null &&
        (marker[1] ?? '').length === baseIndent &&
        isOrderedMarker(marker[2] ?? '') === ordered;
      if (indentOf(following) <= baseIndent && !sibling) {
        break;
      }
      i = j;
      continue;
    }

    const marker = LIST_MARKER.exec(line);
    if (marker && indentOf(line) === baseIndent) {
      if (isOrderedMarker(marker[2] ?? '') !== ordered) {
        break;
      }
      items.push({ text: marker[3] ?? '', children: [] });
      i += 1;
      continue;
    }

    const current = items[items.length - 1];
    if (indentOf(line) > baseIndent && current) {
      const child: string[] = [];
      while (i < lines.length) {
        const childLine = lines[i] ?? '';
        if (childLine.trim() && indentOf(childLine) <= baseIndent) {
          break;
        }
        if (!childLine.trim()) {
          const j = nextNonBlank(i + 1);
          if (j >= lines.length || indentOf(lines[j] ?? '') <= baseIndent) {
            break;
          }
        }
        child.push(childLine);
        i += 1;
      }
      const minIndent = Math.min(
        ...child.filter((l) => l.trim()).map(indentOf),
      );
      current.children.push(
        ...parseBlocks(
          child.map((l) => l.slice(Math.min(minIndent, indentOf(l)))),
          ids,
        ),
      );
      continue;
    }

    break;
  }

  return { block: { type: 'list', ordered, items }, next: i };
}

function classifyParagraph(text: string): Block {
  const label = text.match(/^\*\*([^*]+)\*\*[:：]?$/);
  if (label) {
    return { type: 'label', text: label[1] ?? '' };
  }
  const audience = text.match(/^\*[(（](.+)[)）]\*$/);
  if (audience) {
    return { type: 'audience', text: audience[1] ?? '' };
  }
  return { type: 'p', text };
}

const TONE_BY_LABEL: ReadonlyArray<readonly [RegExp, Tone]> = [
  [/^(what happens next|after you|接下来会发生什么|提交后|保存后)/i, 'success'],
  [/^(important|重要)/i, 'warning'],
  [/^(note|注意)/i, 'info'],
];

/** Callout colour comes from its opening bold label. */
function calloutTone(blocks: readonly Block[]): Tone {
  const first = blocks[0];
  if (!first || !('text' in first)) {
    return 'neutral';
  }
  const label =
    first.type === 'label'
      ? first.text
      : (first.text.match(/^\*\*([^*]+)\*\*/)?.[1] ?? '');
  const match = TONE_BY_LABEL.find(([pattern]) => pattern.test(label.trim()));
  return match ? match[1] : 'neutral';
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

  return {
    type: 'table',
    headers: splitRow(lines[0] ?? ''),
    rows: lines.slice(2).map(splitRow),
  };
}

// ── Rendering ────────────────────────────────────────────────────────────

const TONE_STYLES: Record<Tone, { box: string; icon: string; Icon: LucideIcon }> = {
  success: {
    box: 'border-[#1D9E75] bg-[#F1FAF6]',
    icon: 'text-[#0F6E56]',
    Icon: CheckCircle2,
  },
  info: {
    box: 'border-[#378ADD] bg-[#F2F7FD]',
    icon: 'text-[#1A4A7A]',
    Icon: Info,
  },
  warning: {
    box: 'border-[#BA7517] bg-[#FDF6EA]',
    icon: 'text-[#BA7517]',
    Icon: AlertTriangle,
  },
  neutral: {
    box: 'border-[#D3D1C7] bg-[#F8F8F6]',
    icon: 'text-[#5F5E5A]',
    Icon: ListChecks,
  },
};

function SectionIndex({
  sections,
  title,
}: {
  sections: readonly HeadingBlock[];
  title: string;
}): ReactNode {
  return (
    <nav
      aria-label={title}
      className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EEF1F4] pt-4"
    >
      <span className="mr-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#94a3b8]">
        {title}
      </span>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="inline-flex rounded-full border border-[#E8EBEF] bg-white px-3 text-[12px] leading-6 !text-[rgba(0,0,0,0.65)] transition-colors hover:!border-[#1D9E75] hover:!text-[#0F6E56] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D9E75]"
            >
              {plainText(section.text)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.type) {
    case 'h1':
      return (
        <h1 id={block.id} className="mb-4 text-xl font-semibold text-[rgba(0,0,0,0.88)]">
          {inline(block.text)}
        </h1>
      );
    case 'h2':
      return (
        <h2
          id={block.id}
          className="mb-3 mt-2 flex scroll-mt-4 items-center gap-2.5 text-[17px] font-semibold leading-7 text-[rgba(0,0,0,0.88)]"
        >
          <span className="h-4 w-1 shrink-0 rounded-full bg-[#1D9E75]" aria-hidden />
          <span>{inline(block.text)}</span>
        </h2>
      );
    case 'h3':
      return (
        <h3
          id={block.id}
          className="mb-2 mt-5 scroll-mt-4 text-[14px] font-semibold text-[rgba(0,0,0,0.88)]"
        >
          {inline(block.text)}
        </h3>
      );
    case 'lead':
      return (
        <p className="mb-5 text-[15px] leading-7 text-[rgba(0,0,0,0.65)]">
          {inline(block.text)}
        </p>
      );
    case 'p':
      return <p className="mb-3">{inline(block.text)}</p>;
    case 'label':
      return (
        <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#94a3b8]">
          {inline(block.text)}
        </p>
      );
    case 'audience':
      return (
        <p className="mb-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1EFE8] px-2.5 py-0.5 text-[12px] font-medium leading-5 text-[#5F5E5A]">
            <Users size={12} aria-hidden />
            {inline(block.text)}
          </span>
        </p>
      );
    case 'hr':
      return <hr className="my-8 border-[#EEF1F4]" />;
    case 'list':
      return block.ordered ? (
        <ol className="mb-5 list-none space-y-3 p-0">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-3">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E1F5EE] text-[12px] font-semibold text-[#0F6E56]"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                {inline(item.text)}
                <ListChildren blocks={item.children} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="mb-4 list-disc space-y-1.5 pl-5 marker:text-[#B8B6AE]">
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              {inline(item.text)}
              <ListChildren blocks={item.children} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="my-4 overflow-x-auto rounded-lg border border-[#E8EBEF]">
          <table className="w-full border-collapse text-[13px] leading-6">
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th
                    key={index}
                    className="border-b border-[#E8EBEF] bg-[#FBFCFD] px-3 py-2 text-left font-semibold text-[rgba(0,0,0,0.65)]"
                  >
                    {inline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-b-0">
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`border-b border-[#EEF1F4] px-3 py-2.5 align-top ${
                        cellIndex === 0
                          ? 'min-w-[140px] font-medium text-[rgba(0,0,0,0.88)]'
                          : ''
                      }`}
                    >
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'callout': {
      const style = TONE_STYLES[block.tone];
      return (
        <div className={`my-4 flex gap-3 rounded-lg border-l-4 px-4 py-3 ${style.box}`}>
          <style.Icon size={18} className={`mt-1 shrink-0 ${style.icon}`} aria-hidden />
          <div className="min-w-0 flex-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {block.blocks.map((inner, index) => (
              <BlockView key={index} block={inner} />
            ))}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

function ListChildren({ blocks }: { blocks: readonly Block[] }): ReactNode {
  if (blocks.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 [&>*:last-child]:mb-0">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}

/** Heading text without markdown markers, for the section index. */
function plainText(text: string): string {
  return text.replace(/\*\*|`|\*/g, '');
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
      nodes.push(
        <code
          key={key}
          className="rounded bg-[#F1EFE8] px-1 py-0.5 text-[13px] text-[rgba(0,0,0,0.88)]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-[rgba(0,0,0,0.88)]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={key}
          href={match[3]}
          className="font-medium !text-[#0F6E56] underline-offset-2 hover:underline"
        >
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
