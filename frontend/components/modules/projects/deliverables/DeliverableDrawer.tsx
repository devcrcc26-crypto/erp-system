// Gap completion - new

'use client';

import { Descriptions, Drawer } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useDeliverable } from '@/lib/query/deliverables';
import { layout, standardDetailDrawerProps } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  deliverableStatusVariant,
  formatDeliverableStatus,
} from '@/lib/utils/pm-status-display';
import type { DeliverableStatus } from '@/lib/api/project-management.types';

const PROGRESS_STEPS: DeliverableStatus[] = [
  'PLANNED',
  'IN_PROGRESS',
  'SUBMITTED',
  'APPROVED',
];

function stepIndex(status: DeliverableStatus): number {
  if (status === 'WAIVED') return -1;
  const idx = PROGRESS_STEPS.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export default function DeliverableDrawer({
  projectId,
  deliverableId,
  onClose,
}: {
  projectId: string;
  deliverableId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const open = Boolean(deliverableId);
  const detailQuery = useDeliverable(projectId, deliverableId ?? '', open);
  const item = detailQuery.data;
  const currentIdx = item ? stepIndex(item.status) : 0;

  return (
    <Drawer
      {...standardDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={item?.name ?? 'Deliverable'}
      destroyOnHidden
    >
      {detailQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <div className="erp-page-skeleton h-10 w-full rounded" />
          <div className="erp-page-skeleton h-24 w-full rounded" />
        </div>
      )}

      {item && (
        <div className={layout.drawerStack}>
          <StatusBadge
            label={formatDeliverableStatus(item.status)}
            variant={deliverableStatusVariant(item.status)}
          />

          <Descriptions
            className={layout.drawerDescriptionsClass}
            column={1}
            size="small"
            bordered
          >
            <Descriptions.Item label="Planned date">
              {formatProjectDate(item.dueDate)}
            </Descriptions.Item>
            {item.taskDisciplineName && item.taskDisciplineId && (
              <Descriptions.Item label="Discipline">
                <span
                  className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: tokens.colorTeal50,
                    color: tokens.colorTeal600,
                  }}
                >
                  {item.taskDisciplineName}
                </span>
              </Descriptions.Item>
            )}
            {item.designPackageName && (
              <Descriptions.Item label="Subtask">
                {item.designPackageName}
              </Descriptions.Item>
            )}
          </Descriptions>

          {item.status === 'WAIVED' && (
            <span
              className="inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: tokens.colorGray50,
                color: tokens.colorGray600,
              }}
            >
              Waived
            </span>
          )}

          <div className="flex items-center gap-2">
            {PROGRESS_STEPS.map((step, index) => {
              const completed = currentIdx > index;
              const current = currentIdx === index && item.status !== 'WAIVED';
              return (
                <div key={step} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-medium"
                    style={{
                      backgroundColor: completed
                        ? tokens.colorTeal400
                        : current
                          ? tokens.colorTeal50
                          : tokens.colorGray50,
                      color: completed
                        ? '#fff'
                        : current
                          ? tokens.colorTeal600
                          : tokens.colorGray600,
                      border: `1px solid ${
                        completed || current
                          ? tokens.colorTeal400
                          : tokens.colorBorder
                      }`,
                    }}
                  >
                    {completed ? <CheckOutlined className="text-[10px]" /> : index + 1}
                  </div>
                  <span
                    className="text-center text-[10px]"
                    style={{ color: tokens.colorTextTertiary }}
                  >
                    {formatDeliverableStatus(step)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Drawer>
  );
}
