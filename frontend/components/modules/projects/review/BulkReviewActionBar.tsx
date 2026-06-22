'use client';

import { Button, Checkbox, Space } from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';

export interface BulkReviewActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onApproveAll: () => void;
  onReturnAll: () => void;
  approveLoading?: boolean;
  returnLoading?: boolean;
  disabled?: boolean;
  showApproveAll?: boolean;
}

/**
 * Sticky action bar for batch review operations on selected EDVs.
 */
export default function BulkReviewActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onApproveAll,
  onReturnAll,
  approveLoading = false,
  returnLoading = false,
  disabled = false,
  showApproveAll = true,
}: BulkReviewActionBarProps): React.ReactNode {
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const indeterminate = selectedCount > 0 && selectedCount < totalCount;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
      data-testid="bulk-review-action-bar"
    >
      <Space size="middle" wrap>
        <Checkbox
          checked={allSelected}
          indeterminate={indeterminate}
          disabled={disabled || totalCount === 0}
          onChange={(event: CheckboxChangeEvent) => {
            if (event.target.checked) {
              onSelectAll();
            } else {
              onClearSelection();
            }
          }}
        >
          {selectedCount > 0
            ? `${selectedCount} of ${totalCount} selected`
            : `Select all (${totalCount})`}
        </Checkbox>
        {selectedCount > 0 && (
          <Button type="link" size="small" onClick={onClearSelection} disabled={disabled}>
            Clear
          </Button>
        )}
      </Space>

      <Space wrap>
        {showApproveAll ? (
          <Button
            type="primary"
            disabled={disabled || selectedCount === 0}
            loading={approveLoading}
            onClick={onApproveAll}
          >
            Approve All
          </Button>
        ) : null}
        <Button
          danger
          disabled={disabled || selectedCount === 0}
          loading={returnLoading}
          onClick={onReturnAll}
        >
          Return All
        </Button>
      </Space>
    </div>
  );
}
