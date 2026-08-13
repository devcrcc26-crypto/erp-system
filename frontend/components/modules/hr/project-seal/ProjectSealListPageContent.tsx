"use client";
import ListSearchInput from "@/components/ui/ListSearchInput/ListSearchInput";
import { useCanViewHr } from "@/hooks/use-auth-capabilities";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { ApiRequestError } from "@/lib/api/errors";
import { ProjectSealListItem, ProjectSealStatus } from "@/lib/api/project-seal.types";
import { useProjectSeals } from "@/lib/query/project-seal";
import { formatProjectSealEmployeeName, formatProjectSealStatus, PROJECT_SEAL_STATUS_OPTIONS, projectSealStatusVariant } from "@/lib/utils/project-seal";
import { Alert, Button, Select, Table } from "antd";
import { useMemo, useState } from "react";
import { useUsersDirectory } from "@/lib/query/users";
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import TableUpdatingIndicator from "@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator";
import { ColumnsType } from "antd/es/table";
import { formatProjectDate } from "@/lib/utils/project-display";
import { TableEmptyState, DataTable, StatusBadge } from "@/components/ui";

export default function ProjectSealListPageContent(): React.ReactNode {

    const { params, resetPage, bindMeta } = useTablePagination();
    const { t } = useEpcTranslation();
    const canViewHr = useCanViewHr();
    const [employeeId, setEmployeeId] = useState<string | undefined>();
    const [statusFilter, setStatusFilter] = useState<ProjectSealStatus[]>([]);
    const statusOptions = useMemo(
        () =>[
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
    );

    const router = useRouter();

    const usersQuery = useUsersDirectory(
        {page: 1, limit:100},
        {enabled: canViewHr}
    )

    const [search, setSearch] = useState('');
    const listParams = useMemo(
        () => ({
            ...params,
            search: search.trim() || undefined,
            status: statusFilter.length > 0 ? statusFilter : undefined,
            employeeId: canViewHr ? employeeId : undefined,
        }),
        [params, search, statusFilter, employeeId, canViewHr],
    )
    const listQuery = useProjectSeals(listParams, true);

    const meta = listQuery.data?.meta;
    const rows = listQuery.data?.data ?? [];

    const columns: ColumnsType<ProjectSealListItem> = useMemo(
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
                    render: (_: unknown, row: ProjectSealListItem) =>
                        formatProjectSealEmployeeName(row.employee),
                } satisfies ColumnsType<ProjectSealListItem>[number],
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
                render: (value: string) => formatProjectDate(value),
            },
            {
                title: t('hr.table.status'),
                dataIndex: 'status',
                key: 'status',
                width: 130,
                render: (value: ProjectSealStatus) => (
                    <StatusBadge
                        label={formatProjectSealStatus(value, t)}
                        variant={projectSealStatusVariant(value)}
                    />
                )

             },
            {
                title: t('hr.table.currentTier'),
                dataIndex: 'currentTierLabel',
                key: 'currentTierLabel',
                width: 140,
                ellipsis: true,
                render: (_: string | null | undefined, row: ProjectSealListItem) =>
                    row.directApproved ? t('hr.labels.directApproval') : (row.currentTierLabel ?? '-'),
            }
            
        ], 
        [canViewHr, t],
    )


    return(
        <div>
            {listQuery.isError ? (
                <Alert
                    type="error"
                    title={listQuery.error instanceof ApiRequestError ? listQuery.error.message : t('hr.messages.failedToLoadProjectSeals')}
                />
            ) : null}
            <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
                <ListSearchInput
                    committedValue={search}
                    onCommit = {
                        (value) => {
                            setSearch(value);
                            resetPage();
                        }
                    }
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
                        resetPage();
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
                        style={{ minWidth: 200 }}
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
                ) : null}
                <div className="ml-auto">
                    <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => router.push('/approvals/new/project-seal')}
                    >
                        {t('hr.buttons.newProjectSeal')}
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
                    onClick: () => router.push(`/hr/project-seal/${row.id}`),
                    style: { cursor: 'pointer' },
                })}
                locale={{
                    emptyText: (
                        <TableEmptyState
                            title={t('hr.empty.noProjectSeals')}
                            icon = {<ThunderboltOutlined/>}
                        />
                    )
                }}
            />
        </div>
    )
}