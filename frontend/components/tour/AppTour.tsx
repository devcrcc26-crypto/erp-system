'use client';

import 'driver.js/dist/driver.css';
import '@/styles/driver-theme.css';

import { useCallback, useEffect, useRef } from 'react';
import { driver, type Driver, type DriveStep } from 'driver.js';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { apiPatch } from '@/lib/api/client';
import { useCurrentUser } from '@/lib/query/profile';
import { buildTourSteps, resolveTourRoleGroup } from '@/lib/tours/tour-steps';
import { useAuthStore } from '@/stores/auth.store';

const START_DELAY_MS = 1000;

/**
 * First visible element for a selector, or null. The sidebar renders in both
 * the desktop rail and the (closed) mobile drawer, so the first match in the
 * DOM is not necessarily the one on screen.
 */
function findVisibleElement(selector: string): Element | null {
  const candidates = Array.from(document.querySelectorAll(selector));
  return (
    candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      // Off-canvas (e.g. a drawer translated out of view).
      if (rect.right <= 0 || rect.left >= window.innerWidth) {
        return false;
      }
      const visible = (
        el as Element & { checkVisibility?: (options?: object) => boolean }
      ).checkVisibility?.({ visibilityProperty: true, opacityProperty: true });
      return visible !== false;
    }) ?? null
  );
}

/**
 * Role-aware first-login product tour (Driver.js). Renders nothing.
 *
 * Starts when the session user's `hasSeenTour` is false (login payload, or
 * /auth/me for sessions persisted before the field existed). Finishing or
 * skipping calls PATCH /auth/mark-tour-seen and sets the flag locally. The
 * profile page replays it by setting `hasSeenTour` back to false locally.
 */
export default function AppTour(): null {
  const { t } = useEpcTranslation();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { data: profile } = useCurrentUser();
  const driverRef = useRef<Driver | null>(null);
  const finishedRef = useRef(false);

  const sessionProfile = profile && user && profile.id === user.id ? profile : undefined;
  const hasSeenTour = user?.hasSeenTour ?? sessionProfile?.hasSeenTour;
  const mustChangePassword = user?.mustChangePassword === true;
  const roles = sessionProfile?.roles;
  const primaryRoleName = roles ? ((roles.find((r) => r.isPrimary) ?? roles[0])?.name ?? null) : undefined;

  const markTourSeen = useCallback((): void => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    updateUser({ hasSeenTour: true });
    // Best effort: a failed call only means the tour shows again next login.
    apiPatch<{ success: boolean }>('/auth/mark-tour-seen').catch(() => undefined);
  }, [updateUser]);

  useEffect(() => {
    // Wait for the profile so the role group is known; never tour a user who
    // still has to replace a one-time password.
    if (hasSeenTour !== false || mustChangePassword || primaryRoleName === undefined) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (driverRef.current?.isActive()) {
        return;
      }

      const steps: DriveStep[] = buildTourSteps(resolveTourRoleGroup(primaryRoleName), t)
        .map((step) => {
          const element = findVisibleElement(step.element);
          return element
            ? { element, popover: { title: step.title, description: step.description } }
            : null;
        })
        .filter((step): step is { element: Element; popover: { title: string; description: string } } =>
          step !== null,
        );

      // Nothing to point at (e.g. layout not mounted): try again on a later render.
      if (steps.length === 0) {
        return;
      }

      finishedRef.current = false;
      const tour = driver({
        animate: true,
        showProgress: steps.length > 1,
        showButtons: ['next', 'previous', 'close'],
        nextBtnText: t('tour.buttons.next'),
        prevBtnText: t('tour.buttons.previous'),
        doneBtnText: t('tour.buttons.done'),
        progressText: t('tour.buttons.progress'),
        popoverClass: 'erp-tour-popover',
        overlayColor: '#000000',
        overlayOpacity: 0.45,
        steps,
        // Done, close button, Esc and overlay click all end here.
        onDestroyStarted: () => {
          markTourSeen();
          tour.destroy();
        },
      });
      driverRef.current = tour;
      try {
        tour.drive();
      } catch {
        // Never let the tour break the page.
        tour.destroy();
      }
    }, START_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [hasSeenTour, mustChangePassword, primaryRoleName, t, markTourSeen]);

  // Tear down on unmount (e.g. sign-out) without marking the tour as seen.
  useEffect(
    () => () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    },
    [],
  );

  return null;
}
