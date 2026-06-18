'use client';

import { Col, Row, Spin } from 'antd';
import Card from '@/components/ui/Card/Card';
import KPICard from '@/components/ui/KPICard/KPICard';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import { useProjectStatusBoard } from '@/lib/query/epc-workspace';
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
  const boardQuery = useProjectStatusBoard(projectId);

  const apiUnavailable =
    boardQuery.isError &&
    boardQuery.error instanceof ApiRequestError &&
    (boardQuery.error.status === 404 || boardQuery.error.status === 0);

  if (boardQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  const board = boardQuery.data;

  const kpiSection = (
    <Row gutter={[16, 16]}>
      <Col xs={12} lg={6}>
        <KPICard
          label="Active reviews"
          value={String(board?.activeReviewSessions ?? '—')}
          icon={FileSearchOutlined}
          iconBg="#dbeafe"
          iconColor="#1d4ed8"
        />
      </Col>
      <Col xs={12} lg={6}>
        <KPICard
          label="SLA overdue"
          value={String(board?.slaOverdueSessions ?? '—')}
          icon={ClockCircleOutlined}
          iconBg="#fef3c7"
          iconColor="#92400e"
        />
      </Col>
      <Col xs={12} lg={6}>
        <KPICard
          label="Open comments"
          value={String(board?.openComments ?? '—')}
          icon={CommentOutlined}
          iconBg="#ffedd5"
          iconColor="#c2410c"
        />
      </Col>
      <Col xs={12} lg={6}>
        <KPICard
          label="Pending submittals"
          value={String(board?.pendingSubmittals ?? '—')}
          icon={CheckCircleOutlined}
          iconBg="#dcfce7"
          iconColor="#15803d"
        />
      </Col>
    </Row>
  );

  if (compact) {
    return kpiSection;
  }

  return (
    <FormLayout
      title="EPC status board"
      description="Workflow KPIs derived from design packages, review sessions, and submittals."
    >
      {apiUnavailable && (
        <p className="mb-4 text-sm text-slate-500">
          Status board API not available — KPIs will populate when the backend is connected.
        </p>
      )}

      {kpiSection}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <StatusBreakdownCard
          title="Packages by status"
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
    <Card size="small" title={title}>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No data</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([status, count]) => (
            <li
              key={status}
              className="flex items-center justify-between text-sm"
            >
              <span>{formatProjectedStatus(status)}</span>
              <span className="font-semibold tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
