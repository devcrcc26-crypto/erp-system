export declare const PROJECT_STATUS_VALUES: readonly ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "CANCELLED", "COMPLETED"];
export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];
export interface ProjectStatusDefinition {
    value: ProjectStatus;
    label: string;
}
export declare const PROJECT_STATUS_DEFINITIONS: readonly ProjectStatusDefinition[];
export declare const PROJECT_STATUS_DEFAULT: ProjectStatus;
export declare const LEGACY_PROJECT_STATUS_MAP: Record<string, ProjectStatus>;
export type ProjectStatusBadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'error' | 'orange';
export declare function formatProjectStatusLabel(status: ProjectStatus | string): string;
export declare function projectStatusBadgeVariant(status: ProjectStatus): ProjectStatusBadgeVariant;
export declare const PROJECT_STATUS_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]>;
