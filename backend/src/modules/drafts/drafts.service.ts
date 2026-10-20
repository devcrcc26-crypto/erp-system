import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

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
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyDrafts(
    userId: string,
    companyId: string,
    module?: DraftModule,
  ): Promise<DraftItem[]> {
    const want = (m: DraftModule) => !module || module === m;

    const all = await Promise.all([
      want('leave')
        ? this.prisma.leaveRequest
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, requestNumber: true, leaveType: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'leave' as const,
                number: r.requestNumber,
                title: String(r.leaveType).replace(/_/g, ' '),
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('expense-claim')
        ? this.prisma.expenseClaim
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, claimNumber: true, title: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'expense-claim' as const,
                number: r.claimNumber,
                title: r.title,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('purchase-request')
        ? this.prisma.purchaseRequest
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, requestNumber: true, title: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'purchase-request' as const,
                number: r.requestNumber,
                title: r.title,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('material-requisition')
        ? this.prisma.materialRequisition
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, requestNumber: true, title: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'material-requisition' as const,
                number: r.requestNumber,
                title: r.title,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('consumables')
        ? this.prisma.consumablesRequisition
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, requestNumber: true, title: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'consumables' as const,
                number: r.requestNumber,
                title: r.title,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('vehicle-application')
        ? this.prisma.vehicleApplication
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, applicationNumber: true, purpose: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'vehicle-application' as const,
                number: r.applicationNumber,
                title: r.purpose,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('vehicle-refueling')
        ? this.prisma.vehicleRefueling
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, requestNumber: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'vehicle-refueling' as const,
                number: r.requestNumber,
                title: 'Vehicle Refueling',
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('official-seal')
        ? this.prisma.officialSeal
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, requestNumber: true, description: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'official-seal' as const,
                number: r.requestNumber,
                title: r.description,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('project-seal')
        ? this.prisma.projectSeal
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, requestNumber: true, description: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'project-seal' as const,
                number: r.requestNumber,
                title: r.description,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('exit-permit')
        ? this.prisma.exitPermit
            .findMany({
              where: { employeeId: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, requestNumber: true, direction: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'exit-permit' as const,
                number: r.requestNumber,
                title: `Exit Permit (${String(r.direction)})`,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('per-diem')
        ? this.prisma.perDiemRequest
            .findMany({
              where: {
                employeeId: userId,
                companyId,
                status: 'DRAFT',
                deletedAt: null,
              },
              select: { id: true, requestNumber: true, destination: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'per-diem' as const,
                number: r.requestNumber,
                title: r.destination,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('flight')
        ? this.prisma.flightApplication
            .findMany({
              where: { submittedBy: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, applicationNumber: true, purpose: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'flight' as const,
                number: r.applicationNumber,
                title: r.purpose,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('business-trip')
        ? this.prisma.businessTrip
            .findMany({
              where: { submittedBy: userId, companyId, status: 'DRAFT', deletedAt: null },
              select: { id: true, tripNumber: true, purpose: true, createdAt: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'business-trip' as const,
                number: r.tripNumber,
                title: r.purpose,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],

      want('overtime')
        ? this.prisma.overtimeSheet
            .findMany({
              where: {
                employeeId: userId,
                companyId,
                status: 'DRAFT',
                deletedAt: null,
              },
              select: {
                id: true,
                sheetNumber: true,
                month: true,
                year: true,
                createdAt: true,
                updatedAt: true,
              },
              orderBy: { updatedAt: 'desc' },
            })
            .then((rows) =>
              rows.map((r) => ({
                id: r.id,
                module: 'overtime' as const,
                number: r.sheetNumber,
                title: `${String(r.month).padStart(2, '0')}/${r.year}`,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              })),
            )
        : [],
    ]);

    return all
      .flat()
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}