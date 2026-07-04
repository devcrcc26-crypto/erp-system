"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_STATUS_TRANSITIONS = exports.LEGACY_PROJECT_STATUS_MAP = exports.PROJECT_STATUS_DEFAULT = exports.PROJECT_STATUS_DEFINITIONS = exports.PROJECT_STATUS_VALUES = void 0;
exports.formatProjectStatusLabel = formatProjectStatusLabel;
exports.projectStatusBadgeVariant = projectStatusBadgeVariant;
exports.PROJECT_STATUS_VALUES = [
    'NOT_STARTED',
    'IN_PROGRESS',
    'ON_HOLD',
    'CANCELLED',
    'COMPLETED',
];
exports.PROJECT_STATUS_DEFINITIONS = [
    { value: 'NOT_STARTED', label: 'Not Started' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'COMPLETED', label: 'Completed' },
];
exports.PROJECT_STATUS_DEFAULT = 'NOT_STARTED';
exports.LEGACY_PROJECT_STATUS_MAP = {
    PLANNING: 'NOT_STARTED',
    TENDER: 'NOT_STARTED',
    MOBILIZATION: 'IN_PROGRESS',
    ACTIVE: 'IN_PROGRESS',
    ON_HOLD: 'ON_HOLD',
    COMPLETED: 'COMPLETED',
    CLOSED: 'COMPLETED',
};
const PROJECT_STATUS_LABELS = exports.PROJECT_STATUS_DEFINITIONS.reduce((accumulator, definition) => {
    accumulator[definition.value] = definition.label;
    return accumulator;
}, {});
const PROJECT_STATUS_VARIANTS = {
    NOT_STARTED: 'info',
    IN_PROGRESS: 'success',
    ON_HOLD: 'warning',
    CANCELLED: 'error',
    COMPLETED: 'success',
};
function formatProjectStatusLabel(status) {
    return PROJECT_STATUS_LABELS[status] ?? status;
}
function projectStatusBadgeVariant(status) {
    return PROJECT_STATUS_VARIANTS[status];
}
exports.PROJECT_STATUS_TRANSITIONS = {
    NOT_STARTED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
    ON_HOLD: ['NOT_STARTED', 'IN_PROGRESS', 'CANCELLED'],
    CANCELLED: [],
    COMPLETED: [],
};
//# sourceMappingURL=project-status.js.map