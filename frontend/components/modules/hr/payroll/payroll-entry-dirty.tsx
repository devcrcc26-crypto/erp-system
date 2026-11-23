'use client';

import { createContext, useContext, useEffect } from 'react';

/**
 * Unsaved-edit tracking for the payroll entry drawer. Each form inside the
 * drawer reports whether it has unsaved changes; the drawer asks before it
 * closes or moves to another employee while any form is dirty.
 */
type ReportDirty = (id: string, dirty: boolean) => void;

const PayrollEntryDirtyContext = createContext<ReportDirty>(() => {});

export const PayrollEntryDirtyProvider = PayrollEntryDirtyContext.Provider;

/** Report this form's unsaved state (cleared again when it unmounts). */
export function useReportDirty(id: string, dirty: boolean): void {
  const report = useContext(PayrollEntryDirtyContext);
  useEffect(() => {
    report(id, dirty);
    return () => report(id, false);
  }, [report, id, dirty]);
}
