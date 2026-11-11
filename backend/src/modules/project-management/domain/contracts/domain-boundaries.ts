/**
 * Three-layer domain boundaries - contracts only (Wave 0).
 * Implementation must not collapse layers or bypass write gates.
 */

export const EPC_DOMAIN_LAYERS = {
  FILE: 'LAYER_1_FILE',
  ENGINEERING: 'LAYER_2_ENGINEERING',
  WORKFLOW: 'LAYER_3_WORKFLOW',
} as const;

export type EpcDomainLayer =
  (typeof EPC_DOMAIN_LAYERS)[keyof typeof EPC_DOMAIN_LAYERS];

/** State class 1 - sole writable lifecycle authority. */
export const EPC_STATE_CLASS_SOURCE_OF_TRUTH = {
  entity: 'EngineeringDocumentVersion',
  field: 'status',
  writableVia: 'WorkflowKernel',
} as const;

/** State class 2 - derived aggregates; Phase B projection only. */
export const EPC_STATE_CLASS_STRUCTURAL_AGGREGATES = [
  'DesignPackage.projectedStatus',
  'TaskDiscipline.projectedStatus',
] as const;

/** State class 3 - session-scoped; not authoritative for EDV lifecycle. */
export const EPC_STATE_CLASS_EPHEMERAL_WORKFLOW = [
  'ReviewSession',
  'ReviewComment',
  'ReviewContextSnapshot',
] as const;

export interface EpcLayer1FileBoundary {
  readonly entities: readonly ['Document', 'DocumentVersion', 'DocumentFolder'];
  readonly responsibility: 'storage_and_versioning';
  readonly forbidden: readonly ['workflow_status', 'engineering_logic'];
}

export interface EpcLayer2EngineeringBoundary {
  readonly entities: readonly [
    'EngineeringDocument',
    'EngineeringDocumentVersion',
    'DesignPackage',
    'DesignPackageItem',
    'DesignPackageDependency',
    'TaskDiscipline',
  ];
  readonly lifecycleAuthority: 'EngineeringDocumentVersion.status';
  readonly forbidden: readonly [
    'direct_projected_status_write',
    'per_type_workflow_fork',
  ];
}

export interface EpcLayer3WorkflowBoundary {
  readonly entities: readonly [
    'ReviewSession',
    'ReviewComment',
    'ReviewContextSnapshot',
    'Submittal',
    'SubmittalItem',
    'WorkflowEventLog',
    'RFI',
    'Issue',
    'ChangeRequest',
  ];
  readonly externalBoundaryRule: 'trigger_only_no_edv_mutation';
  readonly forbidden: readonly [
    'infer_edv_status_from_session',
    'external_direct_status_write',
  ];
}

export interface EpcDomainBoundaries {
  readonly layer1: EpcLayer1FileBoundary;
  readonly layer2: EpcLayer2EngineeringBoundary;
  readonly layer3: EpcLayer3WorkflowBoundary;
}

export const EPC_DOMAIN_BOUNDARIES: EpcDomainBoundaries = {
  layer1: {
    entities: ['Document', 'DocumentVersion', 'DocumentFolder'],
    responsibility: 'storage_and_versioning',
    forbidden: ['workflow_status', 'engineering_logic'],
  },
  layer2: {
    entities: [
      'EngineeringDocument',
      'EngineeringDocumentVersion',
      'DesignPackage',
      'DesignPackageItem',
      'DesignPackageDependency',
      'TaskDiscipline',
    ],
    lifecycleAuthority: 'EngineeringDocumentVersion.status',
    forbidden: ['direct_projected_status_write', 'per_type_workflow_fork'],
  },
  layer3: {
    entities: [
      'ReviewSession',
      'ReviewComment',
      'ReviewContextSnapshot',
      'Submittal',
      'SubmittalItem',
      'WorkflowEventLog',
      'RFI',
      'Issue',
      'ChangeRequest',
    ],
    externalBoundaryRule: 'trigger_only_no_edv_mutation',
    forbidden: ['infer_edv_status_from_session', 'external_direct_status_write'],
  },
};
