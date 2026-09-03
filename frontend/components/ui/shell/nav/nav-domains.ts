import type { IconRailItem, IconRailNavStructure } from '@/config/navConfig';

/**
 * A domain is one entry on the sidebar rail. Domains with `items` open a module
 * panel; domains with `href` are single destinations that navigate on click.
 */
export interface NavDomain {
  readonly key: string;
  readonly labelKey: string;
  readonly iconKey: string;
  readonly href: string | null;
  readonly items: readonly IconRailItem[];
}

export interface NavDomainModel {
  /** Domains at the top of the rail — dashboard and the module groups. */
  readonly primary: readonly NavDomain[];
  /** Domains pinned under the rail divider — approvals, audit log, settings. */
  readonly utility: readonly NavDomain[];
  /** Domain holding the current route, when the route maps to one. */
  readonly activeDomainKey: string | null;
}

function directDomain(item: IconRailItem): NavDomain {
  return {
    key: item.key,
    labelKey: item.labelKey,
    iconKey: item.iconKey,
    href: item.href,
    items: [],
  };
}

function containsKey(domain: NavDomain, selectedKey: string): boolean {
  if (domain.href !== null) {
    return domain.key === selectedKey;
  }
  return domain.items.some((item) => item.key === selectedKey);
}

/**
 * Turns the visibility-filtered nav structure into rail domains.
 * Groups become panel domains; top and standalone items become direct links.
 */
export function buildNavDomains(
  structure: IconRailNavStructure,
  selectedKey: string,
): NavDomainModel {
  const primary: NavDomain[] = [
    ...structure.topItems.map(directDomain),
    ...structure.groups
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        key: group.key,
        labelKey: group.labelKey,
        iconKey: group.iconKey,
        href: null,
        items: group.items,
      })),
  ];

  const utility = structure.standalone.map(directDomain);

  const activeDomain =
    primary.find((domain) => containsKey(domain, selectedKey)) ??
    utility.find((domain) => containsKey(domain, selectedKey)) ??
    null;

  return {
    primary,
    utility,
    activeDomainKey: activeDomain?.key ?? null,
  };
}

/** Looks a domain up across both rail sections. */
export function findNavDomain(
  model: NavDomainModel,
  key: string | null,
): NavDomain | null {
  if (key === null) {
    return null;
  }
  return (
    model.primary.find((domain) => domain.key === key) ??
    model.utility.find((domain) => domain.key === key) ??
    null
  );
}

/** First domain that owns a module panel — the fallback when no route matches. */
export function firstPanelDomainKey(model: NavDomainModel): string | null {
  return model.primary.find((domain) => domain.items.length > 0)?.key ?? null;
}
