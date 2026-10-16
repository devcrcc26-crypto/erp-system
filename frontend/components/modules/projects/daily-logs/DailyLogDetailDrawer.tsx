'use client';

import { Button, Descriptions, Drawer, Skeleton, Tag } from 'antd';
import { useRouter } from 'next/navigation';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useDailyLog } from '@/lib/query/daily-logs';
import { layout, wideDetailDrawerProps } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  dailyLogStatusVariant,
  formatDailyLogStatus,
} from '@/lib/utils/pm-status-display';
import { useUserDisplayResolver } from '@/hooks/useUserNameLookup';

export default function DailyLogDetailDrawer({
  projectId,
  dailyLogId,
  onClose,
  onUpdated: _onUpdated,
}: {
  projectId: string;
  dailyLogId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactNode {
  const open = Boolean(dailyLogId);
  const router = useRouter();
  const resolveUserDisplay = useUserDisplayResolver();

  const logQuery = useDailyLog(projectId, dailyLogId ?? '', open);
  const log = logQuery.data;

  const title = log
    ? log.logNumber?.trim() || `Daily log - ${formatProjectDate(log.logDate)}`
    : 'Daily log';

  return (
    <Drawer
      {...wideDetailDrawerProps}
      open={open}
      onClose={onClose}
      title={title}
      destroyOnHidden
      footer={
        log ? (
          <div className="flex justify-end">
            <Button
              type="primary"
              onClick={() =>
                router.push(`/projects/${projectId}/daily-logs/${log.id}`)
              }
            >
              Open full log
            </Button>
          </div>
        ) : undefined
      }
    >
      {logQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      )}

      {logQuery.isError && (
        <p className={layout.drawerMutedText}>
          {logQuery.error instanceof ApiRequestError
            ? logQuery.error.message
            : 'Unable to load daily log.'}
        </p>
      )}

      {log && (
        <div className={layout.drawerStack}>
          <div className="flex items-center gap-2">
            <StatusBadge
              label={formatDailyLogStatus(log.status)}
              variant={dailyLogStatusVariant(log.status)}
            />
          </div>

          <section className={layout.drawerSection}>
            <Descriptions
              className={layout.drawerDescriptionsClass}
              column={1}
              size="small"
              bordered
            >
              <Descriptions.Item label="Log date">
                {formatProjectDate(log.logDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Shift">
                {log.shift ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Weather">
                {log.weatherCondition ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Temperature">
                {log.temperatureC != null ? `${log.temperatureC} °C` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Rainfall">
                {log.rainfallLevel ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Contractor">
                {log.contractorName ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Supervisor">
                {log.supervisorId
                  ? resolveUserDisplay(log.supervisorId, log.supervisorName)
                  : '-'}
              </Descriptions.Item>
              {log.submittedBy && (
                <Descriptions.Item label="Submitted by">
                  {resolveUserDisplay(log.submittedBy, log.submittedByName)}
                  {log.submittedAt
                    ? ` on ${formatProjectDate(log.submittedAt)}`
                    : ''}
                </Descriptions.Item>
              )}
              {log.approvedBy && (
                <Descriptions.Item label="Approved by">
                  {resolveUserDisplay(log.approvedBy, log.approvedByName)}
                  {log.approvedAt
                    ? ` on ${formatProjectDate(log.approvedAt)}`
                    : ''}
                </Descriptions.Item>
              )}
            </Descriptions>
          </section>

          <section className={layout.drawerSection}>
            <p className={`mb-2 ${layout.drawerHeading}`}>Summary</p>
            <div className="flex flex-wrap gap-2">
              <Tag>
                Workforce:{' '}
                <strong>{log.totalWorkers || log.workforceCount || 0}</strong>  
              </Tag>
              <Tag>
                Equipment: <strong>{log.equipmentCount}</strong>
              </Tag>
              <Tag>
                Materials: <strong>{log.materialCount}</strong>
              </Tag>
              <Tag>
                Visitors: <strong>{log.visitorCount}</strong>
              </Tag>
              <Tag color={log.incidentCount > 0 ? 'red' : undefined}>
                Incidents: <strong>{log.incidentCount}</strong>
              </Tag>
            </div>
          </section>

          {log.workDescription?.trim() && (
            <section className={layout.drawerSection}>
              <p className={`mb-1 ${layout.drawerHeading}`}>Work description</p>
              <div className={layout.drawerSurface}>
                <p className={`whitespace-pre-wrap ${layout.drawerMutedText}`}>
                  {log.workDescription.length > 200
                    ? `${log.workDescription.slice(0, 200)}…`
                    : log.workDescription}
                </p>
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
