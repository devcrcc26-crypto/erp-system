'use client';

import './attendance-v2.css';

import { useMemo, useState } from 'react';
import {
  App,
  Button,
  Input,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  listAttendanceIdentities,
  searchAttendanceEmployees,
  updateAttendanceIdentity,
} from '@/lib/api/attendance.api';
import type {
  AttendanceEmployeeSearchResult,
  AttendanceIdentity,
  AttendanceIdentityStatus,
} from '@/lib/api/attendance.types';
import { ApiRequestError } from '@/lib/api/errors';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * HR maintenance page for Deli attendance device identities.
 */
export default function AttendanceIdentitiesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<
    AttendanceIdentityStatus | 'ALL'
  >('ALL');
  const [searchResults, setSearchResults] = useState<
    AttendanceEmployeeSearchResult[]
  >([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const identitiesQuery = useQuery({
    queryKey: ['attendance-identities', statusFilter],
    queryFn: () =>
      listAttendanceIdentities(
        statusFilter === 'ALL' ? undefined : { status: statusFilter },
      ),
  });

  const columns: ColumnsType<AttendanceIdentity> = useMemo(
    () => [
      {
        title: t('pages.hr.attendance.importModal.colAttendanceName'),
        dataIndex: 'attendanceName',
        key: 'attendanceName',
      },
      {
        title: t('pages.hr.attendance.importModal.colIdInSystem'),
        dataIndex: 'attendanceId',
        key: 'attendanceId',
        render: (value: string) => (value && value !== '-' ? value : '—'),
      },
      {
        title: t('pages.hr.attendance.importModal.colMatchType'),
        dataIndex: 'status',
        key: 'status',
        render: (status: AttendanceIdentityStatus) => (
          <Tag color={status === 'MAPPED' ? 'green' : 'default'}>{status}</Tag>
        ),
      },
      {
        title: t('pages.hr.attendance.importModal.colErpName'),
        key: 'user',
        render: (_: unknown, row: AttendanceIdentity) => {
          if (!row.user) {
            return '—';
          }
          const name = `${row.user.firstName} ${row.user.lastName}`.trim();
          return row.user.employeeId
            ? `${name} (${row.user.employeeId})`
            : name;
        },
      },
      {
        title: t('pages.hr.attendance.importModal.colReason'),
        dataIndex: 'reason',
        key: 'reason',
        render: (value: string | null) => value ?? '—',
      },
      {
        title: t('pages.hr.attendance.importModal.colAssign'),
        key: 'actions',
        render: (_: unknown, row: AttendanceIdentity) => {
          if (editingId === row.id) {
            return (
              <Select
                showSearch
                style={{ minWidth: 220 }}
                placeholder={t(
                  'pages.hr.attendance.importModal.searchEmployeePlaceholder',
                )}
                filterOption={false}
                options={searchResults.map((employee) => ({
                  value: employee.id,
                  label: `${employee.firstName} ${employee.lastName}${
                    employee.employeeId ? ` (${employee.employeeId})` : ''
                  }`,
                }))}
                onSearch={(query) => {
                  void (async () => {
                    try {
                      setSearchResults(await searchAttendanceEmployees(query));
                    } catch {
                      setSearchResults([]);
                    }
                  })();
                }}
                onSelect={(userId: string) => {
                  void (async () => {
                    try {
                      await updateAttendanceIdentity(row.id, {
                        status: 'MAPPED',
                        userId,
                      });
                      message.success('Identity updated');
                      setEditingId(null);
                      await queryClient.invalidateQueries({
                        queryKey: ['attendance-identities'],
                      });
                    } catch (error) {
                      message.error(
                        error instanceof ApiRequestError
                          ? error.message
                          : 'Update failed',
                      );
                    }
                  })();
                }}
              />
            );
          }

          return (
            <Space>
              <Button
                type="link"
                className="!px-0"
                onClick={() => {
                  setSearchResults([]);
                  setEditingId(row.id);
                }}
              >
                {t('pages.hr.attendance.importModal.changeEmployee')}
              </Button>
              {row.status === 'IGNORED' ? (
                <Button
                  type="link"
                  className="!px-0"
                  onClick={() => {
                    setSearchResults([]);
                    setEditingId(row.id);
                  }}
                >
                  {t('pages.hr.attendance.importModal.undoIgnore')}
                </Button>
              ) : null}
            </Space>
          );
        },
      },
    ],
    [editingId, message, queryClient, searchResults, t],
  );

  return (
    <div className="attendance-v2 space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/hr/attendance" className="inline-flex items-center gap-1">
            <ArrowLeft size={16} />
            {t('pages.hr.attendance.importModal.title')}
          </Link>
          <h1 className="m-0 text-lg font-semibold">
            {t('nav.hr.attendanceIdentities')}
          </h1>
        </div>
        <Select
          value={statusFilter}
          style={{ width: 160 }}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'MAPPED', label: 'Mapped' },
            { value: 'IGNORED', label: 'Ignored' },
          ]}
          onChange={(value: AttendanceIdentityStatus | 'ALL') =>
            setStatusFilter(value)
          }
        />
      </div>
      <Table<AttendanceIdentity>
        className="erp-data-table"
        rowKey="id"
        loading={identitiesQuery.isLoading}
        columns={columns}
        dataSource={identitiesQuery.data ?? []}
        pagination={{ pageSize: 20 }}
      />
      {statusFilter === 'IGNORED' ? (
        <Input.TextArea
          className="hidden"
          aria-hidden
          tabIndex={-1}
          rows={1}
        />
      ) : null}
    </div>
  );
}
