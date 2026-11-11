export type DraftModule =
  | 'leave'
  | 'expense-claim'
  | 'per-diem'
  | 'consumables'
  | 'exit-permit'
  | 'purchase-request'
  | 'material-requisition'
  | 'vehicle-application'
  | 'vehicle-refueling'
  | 'official-seal'
  | 'project-seal'
  | 'flight'
  | 'business-trip'
  | 'overtime';

export interface DraftItem {
  id: string;
  module: DraftModule;
  number: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}
