'use client';
import { Alert, Button, Skeleton } from "antd";
import { useRouter } from "next/navigation";
import { useEmployeeContract } from "@/lib/query/employee-contract";
import { ApiRequestError } from "@/lib/api/errors";
import { ArrowLeft } from "lucide-react";
import { tokens } from "@/lib/theme/tokens";
import { employeeContractStatusVariant, formatEmployeeContractEmployeeName, formatEmployeeContractStatus, formatEmployeeContractType } from "@/lib/utils/employee-contract-display";
import { StatusBadge } from "@/components/ui";
import { useEpcTranslation } from "@/hooks/use-epc-translation";
import { formatProjectDate } from "@/lib/utils/project-display";
import { SummaryStrip } from "../shared/hr-page-chrome";

export default function EmployeeContractDetailPageContent({
    contractId,
}:{contractId: string}): React.ReactNode {

    const detailQuery = useEmployeeContract(contractId);
    const contract = detailQuery.data;
    const { t } = useEpcTranslation();
   
    const router = useRouter();

    if (detailQuery.isLoading) {
        return <Skeleton active paragraph={{ rows: 8 }} />;
    }

    if (detailQuery.isError || !contract) {
        return (
            <Alert
                type="error"
                showIcon
                title={detailQuery.error instanceof ApiRequestError ? detailQuery.error.message : 'Employee contract not found'}
                action={<Button onClick={() => router.push('/hr/employee-contract')}>Back to list</Button>}
            />
        );
    }


    return(
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <Button
                type="text"
                icon={<ArrowLeft size={16} />}
                onClick={() => router.push('/hr/employee-contract')}
                >
                    Back
                </Button>
            </div>
            <div className = "flex flex-col gap-4">
                <div className="rounded-lg overflow-hidden"
                    style={{
                        background: tokens.colorCardBg,
                        border: `1px solid ${tokens.colorBorder}`,
                    }}
                >
                    <div className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: tokens.colorTextTertiary }}
                            >
                                {contract.contractNumber}
                            </span>
                            <span style={{ color: tokens.colorBorder }}>|</span>
                            <StatusBadge
                            label={formatEmployeeContractStatus(contract.status, t)}
                            variant={employeeContractStatusVariant(contract.status)}
                            />
                            
                        </div>
                        <h2
                        className="text-lg font-semibold leading-snug m-0"
                        style={{ color: tokens.colorTextPrimary }}
                        >
                            Employee Contract - {contract.employee?.firstName} {contract.employee?.lastName}
                        </h2>
                        <p
                        className="mt-1 text-sm m-0"
                        style={{ color: tokens.colorTextSecondary }}
                        >
                            {formatEmployeeContractType(contract.contractType, t)}
                            {contract.signedAt
                            ? ` | Signed ${formatProjectDate(contract.signedAt)}`
                            : null}
                        </p>
                    </div>
                </div>
                <SummaryStrip
                items={[
                    { label: t('hr.labels.contractType'), value: formatEmployeeContractType(contract.contractType, t) },
                    { label: t('hr.labels.signedAt'), value: formatProjectDate(contract.signedAt) },
                    { label: t('hr.labels.startDate'), value: formatProjectDate(contract.startDate) },
                    { label: t('hr.labels.endDate'), value: contract.endDate ? formatProjectDate(contract.endDate) : t('hr.labels.openEnded') },
                ]}
                
                />
            </div>
            
        </div>
    );
}