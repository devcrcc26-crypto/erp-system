/** Common user-id → display-name field pairs for PM entity enrichment. */
export const PM_ASSIGNED_TO_NAME: readonly [string, string][] = [
  ['assignedTo', 'assignedToName'],
];

export const PM_RAISED_ASSIGNED_NAMES: readonly [string, string][] = [
  ['raisedBy', 'raisedByName'],
  ['assignedTo', 'assignedToName'],
];

export const PM_PUNCH_ITEM_USER_NAMES: readonly [string, string][] = [
  ['raisedBy', 'raisedByName'],
  ['assignedTo', 'assignedToName'],
  ['verifiedBy', 'verifiedByName'],
  ['closedBy', 'closedByName'],
];

export const PM_ISSUE_USER_NAMES: readonly [string, string][] = [
  ['raisedBy', 'raisedByName'],
  ['assignedTo', 'assignedToName'],
  ['resolvedBy', 'resolvedByName'],
  ['reopenedBy', 'reopenedByName'],
];

export const PM_OWNER_NAME: readonly [string, string][] = [['ownerId', 'ownerName']];

export const PM_RISK_USER_NAMES: readonly [string, string][] = [
  ['ownerId', 'ownerName'],
  ['createdBy', 'createdByName'],
];

export const PM_SITE_ENGINEER_NAME: readonly [string, string][] = [
  ['siteEngineerId', 'siteEngineerName'],
];

export const PM_DAILY_LOG_USER_NAMES: readonly [string, string][] = [
  ['siteEngineerId', 'siteEngineerName'],
  ['supervisorId', 'supervisorName'],
  ['submittedBy', 'submittedByName'],
  ['approvedBy', 'approvedByName'],
];

export const PM_ORGANIZER_NAME: readonly [string, string][] = [
  ['organizerId', 'organizerName'],
];

export const PM_SUBMITTAL_USER_NAMES: readonly [string, string][] = [
  ['submittedBy', 'submittedByName'],
  ['assignedTo', 'assignedToName'],
  ['reviewedBy', 'reviewedByName'],
];

export const PM_REVIEWED_BY_NAME: readonly [string, string][] = [
  ['reviewedBy', 'reviewedByName'],
];

export const PM_RESPONDED_BY_NAME: readonly [string, string][] = [
  ['respondedBy', 'respondedByName'],
];

export const PM_UPLOADED_BY_NAME: readonly [string, string][] = [
  ['uploadedBy', 'uploadedByName'],
];

export const PM_TEAM_USER_NAMES: readonly [string, string][] = [
  ['userId', 'userName'],
];

export const PM_MEETING_ATTENDEE_NAMES: readonly [string, string][] = [
  ['userId', 'userName'],
];

export const PM_ACTION_ITEM_OWNER_NAME: readonly [string, string][] = [
  ['ownerId', 'ownerName'],
];

export const PM_AGENDA_PRESENTER_NAME: readonly [string, string][] = [
  ['presenterId', 'presenterName'],
];
