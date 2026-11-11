import { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import {
  EmployeeContractStatus,
  EmployeeContractType,
  EmployeeContractUserSummary,
} from "../api/employee-contract.types";
import { formatUserName } from "./user-display";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const EMPLOYEE_CONTRACT_STATUS_OPTIONS: Array<{
  label: string;
  value: EmployeeContractStatus;
}> = [
  { label: "Draft", value: "DRAFT" },
  { label: "Active", value: "ACTIVE" },
  { label: "Superseded", value: "SUPERSEDED" },
  { label: "Terminated", value: "TERMINATED" },
  { label: "Expired", value: "EXPIRED" },
];

export const EMPLOYEE_CONTRACT_TYPE_OPTIONS: Array<{
  label: string;
  value: EmployeeContractType;
}> = [
  { label: "Fixed Term", value: "FIXED_TERM" },
  { label: "Open Ended", value: "OPEN_ENDED" },
  { label: "Probation", value: "PROBATION" },
  { label: "Renewal", value: "RENEWAL" },
];

export function formatEmployeeContractStatus(
  status: string,
  t?: TFn,
): string {
  if (t) return t(`hr.status.${status}`);
  const found = EMPLOYEE_CONTRACT_STATUS_OPTIONS.find((o) => o.value === status);
  return found ? found.label : status;
}

export function employeeContractStatusVariant(
  status: EmployeeContractStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case "DRAFT":
      return "info";
    case "ACTIVE":
      return "success";
    case "SUPERSEDED":
      return "info";
    case "TERMINATED":
      return "error";
    case "EXPIRED":
      return "warning";
    default:
      return "default";
  }
}

export function formatEmployeeContractEmployeeName(
  user?: EmployeeContractUserSummary | null,
): string {
  if (!user) return "-";
  return formatUserName(user);
}

export function formatEmployeeContractType(
  type: EmployeeContractType | string,
  t?: TFn,
): string {
  if (t) return t(`hr.contractType.${type}`);
  const found = EMPLOYEE_CONTRACT_TYPE_OPTIONS.find((o) => o.value === type);
  return found ? found.label : type;
}

export function contractTypeRequiresEndDate(
  type: EmployeeContractType | string | undefined,
): boolean {
  return (
    type === "FIXED_TERM" || type === "PROBATION" || type === "RENEWAL"
  );
}
