'use client';
import ListSearchInput from "@/components/ui/ListSearchInput/ListSearchInput";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { ApiRequestError } from "@/lib/api/errors";
import { useOfficialSeals } from "@/lib/query/official-seal";
import { Alert, Button, Select } from "antd";
import { useMemo, useState } from "react";
import { OfficialSealListItem, OfficialSealStatus, OfficialSealUrgency } from "@/lib/api/official-seal.types";
import { useUsersDirectory } from "@/lib/query/users";
import { useCanViewHr } from "@/hooks/use-auth-capabilities";
import { DatePicker } from "antd";
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import TableUpdatingIndicator from "@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator";
import { DataTable, StatusBadge, TableEmptyState } from "@/components/ui";
import { ColumnsType } from "antd/es/table";
import { formatOfficialSealEmployeeName, formatOfficialSealStatus, officialSealStatusVariant } from "@/lib/utils/official-seal";
import { formatProjectDate } from "@/lib/utils/project-display";

const { RangePicker } = DatePicker;

export default function OfficialSealListPageContent(): React.ReactNode {
    const { params, resetPage, bindMeta } = useTablePagination();
    const { t } = useEpcTranslation();
    const canViewHr = useCanViewHr();
    const [employeeId, setEmployeeId] = useState<string | undefined>();
    const [statusFilter, setStatusFilter] = useState<OfficialSealStatus[]>([]);
    const statusOptions = useMemo(
        () => [
            { value: 'DRAFT', label: t('hr.status.DRAFT') },
            { value: 'SUBMITTED', label: t('hr.status.SUBMITTED') },
            { value: 'IN_REVIEW', label: t('hr.status.IN_REVIEW') },
            { value: 'APPROVED', label: t('hr.status.APPROVED') },
            { value: 'REJECTED', label: t('hr.status.REJECTED') },
            { value: 'RETURNED', label: t('hr.status.RETURNED') },
            { value: 'CANCELLED', label: t('hr.status.CANCELLED') },
            { value: 'SEAL_ISSUED', label: t('hr.status.SEAL_ISSUED') },
        ],
        [t],
    )

    const usersQuery = useUsersDirectory(
        { page: 1, limit: 100 },
        { enabled: canViewHr },
    );
    
    const listQuery = useOfficialSeals();
    const [search, setSearch] = useState('');
    const router = useRouter();

    const meta = listQuery.data?.meta;
    const rows = listQuery.data?.data ?? [];

    const columns: ColumnsType<OfficialSealListItem> = useMemo(
        () => [
            {
                title: t('hr.table.requestNumber'),
                dataIndex: 'requestNumber',
                key: 'requestNumber',
                width: 120,
            },
            ...(canViewHr ? [
                {
                    title: t('hr.table.employee'),
                    key: 'employee',
                    render: (_: unknown, row: OfficialSealListItem) =>
                        formatOfficialSealEmployeeName(row.employee),
                } satisfies ColumnsType<OfficialSealListItem>[number],
            ] : []),
            {
                title: t('hr.table.urgency'),
                dataIndex: 'urgency',
                key: 'urgency',
                width: 120,
                
            },
            {
                title: t('hr.table.dateNeeded'),
                dataIndex: 'dateNeeded',
                key: 'dateNeeded',
                width: 120,
            },
            {
                title: t('hr.table.status'),
                dataIndex: 'status',
                key: 'status',
                width: 130,
                render: (value: OfficialSealStatus) => (
                    <StatusBadge
                        label={formatOfficialSealStatus(value, t)}
                        variant={officialSealStatusVariant(value)}
                    />
                ),
            },
            {
                title: t('hr.table.currentTier'),
                dataIndex: 'currentTierLabel',
                key: 'currentTierLabel',
                width: 140,
                ellipsis: true,
                render: (_: string | null | undefined, row: OfficialSealListItem) =>
                    row.directApproved ? 'Direct approval' : (row.currentTierLabel ?? '-'),
            },
        ],
        [canViewHr, t],
    )

    return(
        <div>
            {listQuery.isError ? (
                <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    title={listQuery.error instanceof ApiRequestError ? listQuery.error.message : 'Failed to load official seals'}
                />
            ) : null}
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
                <ListSearchInput
                    committedValue={search}
                    onCommit={(value) => {
                        setSearch(value);
                        resetPage();
                    }}
                    placeholder={t('hr.placeholder.searchOfficialSeal')}
                    style={{ width: 260 }}
                />
                <Select
                    mode="multiple"
                    allowClear
                    placeholder={t('hr.placeholder.status')}
                    options={statusOptions}
                    value={statusFilter}
                    onChange={(v) => {
                        setStatusFilter(v);
                    }}
                    style={{ minWidth: 160 }}
                    maxTagCount="responsive"
                />
                {canViewHr ? (
                    <Select
                        showSearch
                        allowClear
                        placeholder={t('hr.placeholder.employee')}
                        loading={usersQuery.isLoading}
                        value={employeeId}
                        onChange={(v) => {
                            setEmployeeId(v);
                            resetPage();
                        }}
                        style={{ width: 200 }}
                        filterOption={(input, option) =>
                            String(option?.label ?? '')
                                .toLowerCase()
                                .includes(input.toLowerCase())
                        }
                        options={
                            usersQuery.data?.data?.map((u) => ({
                                value: u.id,
                                label: `${u.firstName} ${u.lastName}`,
                            })) ?? []}
                    />
                ):null}
                <RangePicker
                    style={{ width: 230 }}
                    placeholder={[t('hr.placeholder.dateFrom'), t('hr.placeholder.dateTo')]}
                />
                <div className="ml-auto">
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => router.push('/approvals/new/official-seal')}
                    >
                        {t('hr.buttons.newOfficialSeal')}
                    </Button>
                </div>
            </div>
            {listQuery.isFetching && listQuery.data ? (
                <TableUpdatingIndicator active={listQuery.isFetching} />
            ) : null}

            <DataTable
                rowKey="id"
                columns={columns}
                dataSource={rows}
                pagination={meta ? bindMeta(meta) : false}
                onRow = {(row) => ({
                    onClick: () => router.push(`/hr/official-seal/${row.id}`),
                    style: { cursor: 'pointer' },
                })}
                locale={{
                    emptyText: (
                        <TableEmptyState
                            title={t('hr.table.noOfficialSealRequests')}
                            icon = {<ThunderboltOutlined/>}
                        />
                    )
                }}

            />
        </div>
    )
}