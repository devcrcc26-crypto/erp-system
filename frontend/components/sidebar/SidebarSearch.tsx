'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { SidebarLocatedLink } from '@/components/sidebar/sidebar-model';

const RESULT_SELECTOR = '[data-sidebar-result]';

function resultLinks(listId: string): HTMLElement[] {
  const list = document.getElementById(listId);
  return list ? Array.from(list.querySelectorAll<HTMLElement>(RESULT_SELECTOR)) : [];
}

function subscribeNever(): () => void {
  return () => undefined;
}

function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/**
 * "Find a module" field. Filters the sidebar in real time; ↓ moves into the
 * results, Enter opens the first match, Esc clears (then closes the panel).
 * Cmd/Ctrl+K is bound by `SidebarShell` and focuses this input.
 */
export default function SidebarSearch({
  query,
  onQueryChange,
  results,
  inputId,
  resultsId,
  onNavigate,
  onEscapeEmpty,
  t,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  results: readonly SidebarLocatedLink[];
  /** Element id of the input - the shell focuses it for Cmd/Ctrl+K. */
  inputId: string;
  /** Id of the element rendered by `SidebarSearchResults`. */
  resultsId: string;
  onNavigate?: () => void;
  /** Esc on an empty field - e.g. close the docked search panel. */
  onEscapeEmpty?: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}): React.ReactNode {
  const router = useRouter();
  const apple = useSyncExternalStore(subscribeNever, isApplePlatform, () => false);
  const shortcut = apple ? '⌘K' : 'Ctrl K';

  const hasQuery = query.trim().length > 0;

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      const first = resultLinks(resultsId)[0];
      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === 'Enter') {
      const href = results[0]?.link.href;
      if (hasQuery && href) {
        event.preventDefault();
        router.push(href);
        onQueryChange('');
        onNavigate?.();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (query) {
        event.preventDefault();
        event.stopPropagation();
        onQueryChange('');
      } else if (onEscapeEmpty) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeEmpty();
      }
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        {t('shell.searchNavigation')}
      </label>
      <div className="sb-search-field">
        <span className="sb-search-icon" aria-hidden>
          <Search size={15} strokeWidth={2} />
        </span>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('shell.searchNavigation')}
          autoComplete="off"
          spellCheck={false}
          aria-controls={hasQuery ? resultsId : undefined}
          aria-keyshortcuts="Control+K Meta+K"
          className="sb-search-input"
        />
        {hasQuery ? null : (
          <kbd className="sb-kbd" aria-hidden>
            {shortcut}
          </kbd>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {hasQuery ? t('shell.searchResultCount', { count: results.length }) : ''}
      </p>
    </div>
  );
}

/**
 * Result list for `SidebarSearch`. ↑/↓ move between results; ↑ on the first
 * result and Esc return to the field.
 */
export function SidebarSearchResults({
  id,
  inputId,
  children,
  empty,
  emptyLabel,
}: {
  id: string;
  /** Element id of the search input, for returning focus. */
  inputId?: string;
  children: React.ReactNode;
  empty: boolean;
  emptyLabel: string;
}): React.ReactNode {
  function focusInput(from: HTMLElement): void {
    const field = inputId
      ? document.getElementById(inputId)
      : from.closest('.sb-theme')?.querySelector<HTMLInputElement>('.sb-search-input');
    field?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLUListElement>): void {
    const target = event.target as HTMLElement;
    if (!target.matches(RESULT_SELECTOR)) {
      return;
    }
    const links = resultLinks(id);
    const index = links.indexOf(target);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      links[Math.min(index + 1, links.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index <= 0) {
        focusInput(target);
      } else {
        links[index - 1]?.focus();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      focusInput(target);
    }
  }

  if (empty) {
    return (
      <p id={id} className="sb-empty">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul id={id} className="sb-list" onKeyDown={handleKeyDown}>
      {children}
    </ul>
  );
}
