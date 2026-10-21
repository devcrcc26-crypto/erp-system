'use client';

import '@/components/modules/hr/overtime/overtime-entries-v2.css';

/**
 * Overtime-style entries card for HR requisition item tables on create forms.
 */
export default function HrFormItemsSection({
  titleId,
  title,
  count,
  addButton,
  children,
  headerExtra,
}: {
  titleId: string;
  title: string;
  count: number;
  addButton?: React.ReactNode;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
}): React.ReactNode {
  return (
    <section
      className="erp-pro-card erp-ot-entries min-w-0"
      aria-labelledby={titleId}
    >
      {headerExtra}
      <div className="erp-ot-entries-header">
        <h3 id={titleId} className="erp-ot-entries-title">
          {title}
          <span className="erp-ot-entries-count">
            {count.toLocaleString()}
          </span>
        </h3>
        {addButton ? (
          <div className="erp-ot-entries-actions">{addButton}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function HrDrawerFormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-hr-item-drawer-section erp-expense-item-section">
      <div className="erp-hr-item-drawer-section-header erp-expense-item-section-header">
        <h3 className="erp-hr-item-drawer-section-title erp-expense-item-section-title">
          {title}
        </h3>
      </div>
      <div className="erp-hr-item-drawer-section-body erp-expense-item-section-body">
        {children}
      </div>
    </div>
  );
}
