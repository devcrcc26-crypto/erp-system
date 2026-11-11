// UI polish pass - styles only, no logic changes

'use client';

import { Col, Row } from 'antd';
import { BarChart3 } from 'lucide-react';
import Card from '@/components/ui/Card/Card';
import TableEmptyState from '@/components/ui/TableEmptyState';
import KPICard from '@/components/ui/KPICard/KPICard';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { tokens } from '@/lib/theme/tokens';
import { ApiRequestError } from '@/lib/api/errors';
import { useProjectStatusBoard } from '@/lib/query/epc-workspace';
import { useCanViewEpcEngineering, usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatProjectedStatus } from '@/lib/utils/epc-display';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';

export default function ProjectStatusBoard({
  projectId,
  compact = false,
}: {
  projectId: string;
  compact?: boolean;
}): React.ReactNode {
  const permLoading = usePermissionsLoading();
  const canViewEpcEngineering = useCanViewEpcEngineering();
  const boardQuery = useProjectStatusBoard(
    projectId,
    !permLoading && canViewEpcEngineering,
  );
  const { t } = useEpcTranslation();

  const apiUnavailable =
    boardQuery.isError &&
    boardQuery.error instanceof ApiRequestError &&
    (boardQuery.error.status === 404 || boardQuery.error.status === 0);

  if (permLoading || boardQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewEpcEngineering) {
    return null;
  }

  const board = boardQuery.data;

  const kpiSection = (
    <Row gutter={[12, 12]}>
      <Col xs={12} lg={6}>
        <KPICard
          label="Active reviews"
          value={String(board?.activeReviewSessions ?? '-')}
          icon={FileSearchOutlined}
          iconBg={tokens.colorBlue50}
          iconColor={tokens.colorBlue400}
        />
      </Col>
      <Col xs={12} lg={6}>
        <KPICard
          label="SLA overdue"
          value={String(board?.slaOverdueSessions ?? '-')}
          icon={ClockCircleOutlined}
          iconBg={tokens.colorAmber50}
          iconColor={tokens.colorAmber400}
        />
      </Col>
      <Col xs={12} lg={6}>
        <KPICard
          label="Open comments"
          value={String(board?.openComments ?? '-')}
          icon={CommentOutlined}
          iconBg={tokens.colorTeal50}
          iconColor={tokens.colorTeal600}
        />
      </Col>
      <Col xs={12} lg={6}>
        <KPICard
          label="Pending submittals"
          value={String(board?.pendingSubmittals ?? '-')}
          icon={CheckCircleOutlined}
          iconBg={tokens.colorGreen50}
          iconColor={tokens.colorGreen600}
        />
      </Col>
    </Row>
  );

  if (compact) {
    return kpiSection;
  }

  return (
    <FormLayout
      title={t('pages.statusBoard.title')}
      description={t('pages.statusBoard.description')}
    >
      {apiUnavailable && (
        <p
          className="mb-4 text-[12px] font-normal"
          style={{ color: tokens.colorTextSecondary }}
        >
          Status board API not available - KPIs will populate when the backend is connected.
        </p>
      )}

      {kpiSection}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StatusBreakdownCard
          title="Subtasks by status"
          data={board?.packagesByStatus ?? {}}
        />
        <StatusBreakdownCard
          title="Disciplines by status"
          data={board?.disciplinesByStatus ?? {}}
        />
      </div>
    </FormLayout>
  );
}

function StatusBreakdownCard({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}): React.ReactNode {
  const entries = Object.entries(data);

  return (
    <Card
      size="small"
      title={
        <span
          className="text-[13px] font-medium"
          style={{ color: tokens.colorTextPrimary }}
        >
          {title}
        </span>
      }
      styles={{
        header: {
          padding: '14px 18px',
          borderBottom: `0.5px solid ${tokens.colorBorder}`,
          minHeight: 'auto',
        },
        body: { padding: '16px 18px' },
      }}
      style={{
        borderRadius: tokens.borderRadiusCard,
        border: `0.5px solid ${tokens.colorBorder}`,
        boxShadow: 'none',
      }}
    >
      {entries.length === 0 ? (
        <TableEmptyState
          icon={<BarChart3 />}
          title="No data"
          description="Status counts will appear when subtasks or disciplines are active"
        />
      ) : (
        <ul className="space-y-2">
          {entries.map(([status, count]) => (
            <li
              key={status}
              className="flex items-center justify-between text-[13px]"
            >
              <span style={{ color: tokens.colorTextPrimary }}>
                {formatProjectedStatus(status)}
              </span>
              <span
                className="font-medium tabular-nums"
                style={{ color: tokens.colorTextPrimary }}
              >
                {count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
