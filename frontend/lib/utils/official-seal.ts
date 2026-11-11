import {
    OfficialSealStatus,
    OfficialSealUrgency,
    OfficialSealUserSummary,
} from "../api/official-seal.types";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import { formatUserName } from "./user-display";
type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const OFFICIAL_SEAL_URGENCY_OPTIONS: Array<{
    value: OfficialSealUrgency;
    label: string;
}> = [
    { value: 'MINOR', label: 'Minor' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'URGENT', label: 'Urgent' },
    { value: 'CRITICAL', label: 'Critical' },
];

export const OFFICIAL_SEAL_STATUS_OPTIONS: Array<{
    value: OfficialSealStatus;
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

export function formatOfficialSealStatus(status: string, t?: TFn): string {
    if(t) return t(`hr.status.${status}`);
    const found = OFFICIAL_SEAL_STATUS_OPTIONS.find(
        (o) => o.value === status,
    );
    return found?.label ?? status;
}

export function officialSealStatusVariant(
    status: OfficialSealStatus | string
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

export function formatOfficialSealEmployeeName(
    user?: OfficialSealUserSummary | null,
): string {
    if (!user) return '-';
    return formatUserName(user);
}

export function formatOfficialSealUrgency(urgency: string, t?: TFn): string {
    if (t) return t(`hr.urgency.${urgency}`);
    const found = OFFICIAL_SEAL_URGENCY_OPTIONS.find((o) => o.value === urgency);
    return found?.label ?? urgency;
}