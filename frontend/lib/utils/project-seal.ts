import { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import { ProjectSealStatus, ProjectSealUrgency, ProjectSealUserSummary } from "../api/project-seal.types";
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const PROJECT_SEAL_STATUS_OPTIONS: Array<{
    value: ProjectSealStatus;
    label: string;
}> = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'IN_REVIEW', label: 'In Review' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'RETURNED', label: 'Returned' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'SEAL_ISSUED', label: 'Seal Issued' },
];

export const PROJECT_SEAL_URGENCY_OPTIONS: Array<{
    value: ProjectSealUrgency;
    label: string;
}> = [
    { value: 'MINOR', label: 'Minor' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'URGENT', label: 'Urgent' },
    { value: 'CRITICAL', label: 'Critical' },
];
export const formatProjectSealStatus = (status: string, t?: TFn): string => {
    if(t) return t(`hr.status.${status}`);
    const found = PROJECT_SEAL_STATUS_OPTIONS.find(
        (o) => o.value === status,
    );
    return found?.label ?? status;
}

export function projectSealStatusVariant(
    status: ProjectSealStatus | string
): StatusBadgeVariant {
    switch(status) {
        case 'SEAL_ISSUED':
        case 'APPROVED':
            return 'success';
        case 'REJECTED':
            return 'error';
        case 'RETURNED':
            return 'warning';
        case 'SUBMITTED':
            return 'info';
        case 'IN_REVIEW':
            return 'warning';
        case 'CANCELLED':
        case 'DRAFT':
        default:
            return 'default';
    }
}

export function formatProjectSealEmployeeName(
    user?: ProjectSealUserSummary | null,
): string {
    if(!user) return '';
    return formatUserName(user);
}

export function formatProjectSealUrgency(urgency: string, t?: TFn): string {
    if(t) return t(`hr.urgency.${urgency}`);
    const found = PROJECT_SEAL_URGENCY_OPTIONS.find(
        (o) => o.value === urgency,
    );
    return found?.label ?? urgency;
}