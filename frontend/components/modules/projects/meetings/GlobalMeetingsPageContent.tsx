'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select, Space, Tabs } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Users } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { ApiRequestError } from '@/lib/api/errors';
import type { MyMeeting } from '@/lib/api/project-management.types';
import { useAllMeetings, useMyMeetings } from '@/lib/query/meetings';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatMeetingStatus,
  meetingStatusVariant,
} from '@/lib/utils/pm-status-display';
import { MeetingFormDrawer } from '@/components/modules/projects/meetings/MeetingsPageContent';
import MeetingDetailDrawer from '@/components/modules/projects/meetings/MeetingDetailDrawer';
import {
  useCanViewMeetings,
  useEpcCapabilities,
  useGlobalPortfolioListMode,
  usePermissionsLoading,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';
import { tokens } from '@/lib/theme/tokens';

type MeetingsTabKey = 'upcoming' | 'past' | 'cancelled';

function scopeLabel(meeting: MyMeeting): string {
  if (meeting.scope === 'SUBTASK') {
    return meeting.designPackageName ?? 'Subtask';
  }
  if (meeting.scope === 'DISCIPLINE') {
    return meeting.taskDisciplineName ?? 'Discipline';
  }
  return 'Project-wide';
}

/**
 * Global Meetings list - cross-project, user-scoped or portfolio-wide.
 */
export default function GlobalMeetingsPageContent(): React.ReactNode {
  const { params, resetPage, bindMeta } = useTablePagination();
  const [activeTab, setActiveTab] = useState<MeetingsTabKey>('upcoming');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<{
    projectId: string;
    meetingId: string;
  } | null>(null);

  const capabilitiesReady = !usePermissionsLoading();
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  const portfolioMode =
    epc.navFullAccess ||
    (useGlobalPortfolioListMode() &&
      pm.meetings.canView &&
      !epc.navDesigner &&
      !epc.navDisciplineLeader);
  const canViewPersonal = useCanViewMeetings();
  const canAccessPage = portfolioMode || canViewPersonal;
  const canCreate =
    epc.navFullAccess ||
    epc.navDisciplineLeader ||
    epc.navDesigner ||
    pm.meetings.canCreate;

  const filterParams = { search: search.trim() || undefined };

  const listParams = { ...params, ...filterParams };

  const myQuery = useMyMeetings(
    listParams,
    capabilitiesReady && canAccessPage && !portfolioMode,
  );
  const allQuery = useAllMeetings(
    listParams,
    capabilitiesReady && canAccessPage && portfolioMode,
  );
  const meetingsQuery = portfolioMode ? allQuery : myQuery;

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  function isUpcoming(meeting: MyMeeting): boolean {
    if (meeting.status === 'CANCELLED') {
      return false;
    }
    if (meeting.status === 'SCHEDULED' || meeting.status === 'IN_PROGRESS') {
      return true;
    }
    if (meeting.status === 'COMPLETED') {
      return false;
    }
    return new Date(meeting.meetingDate).getTime() >= startOfToday;
  }

  const rows = (meetingsQuery.data?.data ?? []).filter((meeting) => {
    if (activeTab === 'cancelled') {
      return meeting.status === 'CANCELLED';
    }
    if (activeTab === 'upcoming') {
      return isUpcoming(meeting);
    }
    return meeting.status !== 'CANCELLED' && !isUpcoming(meeting);
  });

  const counts = useMemo(() => {
    const all = meetingsQuery.data?.data ?? [];
    let upcoming = 0;
    let past = 0;
    let cancelled = 0;
    for (const meeting of all) {
      if (meeting.status === 'CANCELLED') {
        cancelled += 1;
      } else if (isUpcoming(meeting)) {
        upcoming += 1;
      } else {
        past += 1;
      }
    }
    return { upcoming, past, cancelled };
  }, [meetingsQuery.data?.data, startOfToday]);

  const columns: ColumnsType<MyMeeting> = useMemo(
    () => [
      {
        title: 'Meeting #',
        dataIndex: 'meetingNumber',
        key: 'meetingNumber',
        render: (value: string, record) => (
          <Button
            type="link"
            className="!px-0"
            style={{ color: tokens.colorTeal600 }}
            onClick={(e) => {
              e.stopPropagation();
              setSelected({
                projectId: record.projectId,
                meetingId: record.id,
              });
            }}
          >
            {value}
          </Button>
        ),
      },
      { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true },
      {
        title: 'Date',
        dataIndex: 'meetingDate',
        key: 'meetingDate',
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: 'Time',
        key: 'time',
        render: (_: unknown, record: MyMeeting) =>
          record.startTime || record.endTime
            ? `${record.startTime ?? '-'} – ${record.endTime ?? '-'}`
            : '-',
      },
      {
        title: 'Scope',
        key: 'scope',
        render: (_: unknown, record: MyMeeting) => scopeLabel(record),
      },
      {
        title: 'Attendees',
        key: 'attendeeCount',
        render: (_: unknown, record: MyMeeting) => record.attendeeCount ?? 0,
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: MyMeeting['status']) => (
          <StatusBadge
            label={formatMeetingStatus(status)}
            variant={meetingStatusVariant(status)}
          />
        ),
      },
      {
        title: 'Project',
        key: 'project',
        render: (_: unknown, record: MyMeeting) =>
          record.projectCode?.trim() || '-',
      },
    ],
    [],
  );

  if (!capabilitiesReady || (meetingsQuery.isLoading && !meetingsQuery.data)) {
    return <PageLoadingSkeleton />;
  }

  if (!canAccessPage) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to view meetings."
      />
    );
  }

  const apiUnavailable =
    meetingsQuery.isError &&
    meetingsQuery.error instanceof ApiRequestError &&
    (meetingsQuery.error.status === 404 || meetingsQuery.error.status === 0);

  const meta = meetingsQuery.data?.meta;

  return (
    <>
      <FormLayout
        title="Meetings"
        description={
          portfolioMode
            ? 'All meetings across projects.'
            : 'Meetings you organize, attend, or hold an FK role on.'
        }
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              disabled={apiUnavailable}
            >
              New meeting
            </Button>
          ) : undefined
        }
      >
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            className="!mb-4"
            title="Meeting APIs are not connected yet."
            description="This page is ready - data will appear when the backend is available."
          />
        )}

        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key as MeetingsTabKey);
            resetPage();
          }}
          items={[
            { key: 'upcoming', label: `Upcoming (${counts.upcoming})` },
            { key: 'past', label: `Past (${counts.past})` },
            { key: 'cancelled', label: `Cancelled (${counts.cancelled})` },
          ]}
        />

        <Space wrap className="!mb-4">
          <ListSearchInput
            placeholder="Search by title or meeting number"
            className={layout.filterControl}
            committedValue={search}
            onCommit={(value) => {
              resetPage();
              setSearch(value);
            }}
          />
        </Space>

        <TableUpdatingIndicator
          active={meetingsQuery.isFetching && Boolean(meetingsQuery.data)}
        />

        <DataTable<MyMeeting>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={bindMeta(meta)}
          onRow={(record) => ({
            onClick: () =>
              setSelected({ projectId: record.projectId, meetingId: record.id }),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<Users />}
                title="No meetings found"
                action={
                  canCreate && !apiUnavailable
                    ? { label: 'New meeting', onClick: () => setCreateOpen(true) }
                    : undefined
                }
              />
            ),
          }}
        />
      </FormLayout>

      <MeetingFormDrawer
        open={createOpen}
        showProjectSelector
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          void meetingsQuery.refetch();
          setCreateOpen(false);
        }}
      />

      {selected ? (
        <MeetingDetailDrawer
          projectId={selected.projectId}
          meetingId={selected.meetingId}
          onClose={() => setSelected(null)}
          onUpdated={() => void meetingsQuery.refetch()}
        />
      ) : null}
    </>
  );
}
