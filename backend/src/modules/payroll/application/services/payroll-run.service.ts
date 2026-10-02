import { PrismaService } from "../../../../shared/prisma/prisma.service";
import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { Decimal} from '@prisma/client/runtime/library';
import { randomUUID } from "crypto";
import {
    PayrollCalculationService,
    type OvertimeHours,
} from './payroll-calculation.service'
import { getLeaveCoveredAbsences } from '../../../attendance/application/services/attendance-leave.util'


interface ServiceContext {
    userId: string
    companyId: string
}

@Injectable()
export class PayrollRunService {

    private readonly logger =  new Logger(PayrollRunService.name)
    constructor(
        private readonly prisma: PrismaService,
        private readonly calc: PayrollCalculationService
    ){}


    private generateRunNumber(month: number, year: number): string{
        const m = String(month).padStart(2, '0')
        return `PR-${year}-${m}`
    }

    private toNumber(value: Decimal | null | undefined): number {
        if (value == null) return 0
        return Number(value)
    }

    async getRun(runId: string, companyId: string){
        const run = await this.prisma.payrollRun.findFirst({
            where: {id: runId, companyId, deletedAt: null},
            include:{
                entries: {
                    include: {
                        employee: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                employeeId: true,
                                department: {select: {id: true, name:true}},
                                engineeringDiscipline: {select: {id: true, name: true}},
                            },
                        },
                        salaryPeriods: true,
                    },
                    orderBy: {employee: {firstName: 'asc'}},
                },
            },
        })

        if(!run) throw new NotFoundException('Payroll run not found');
        return run;
    }

    async listRuns(companyId: string){
        return this.prisma.payrollRun.findMany({
            where: {companyId, deletedAt: null},
            include: {
                _count: {select: {entries: true}},
            },
            orderBy: [{year: 'desc'}, {month: 'desc'}]
        })
    }

    async createRun(
        month: number,
        year: number,
        ctx: ServiceContext
    ){
        if( month < 1 || month > 12){
            throw new BadRequestException('Month must be between 1 and 12')
        }

        const existing = await this.prisma.payrollRun.findFirst({
            where: {companyId: ctx.companyId, month, year, deletedAt: null},
        })

        if (existing) {
            throw new BadRequestException(
                `Payroll run for ${month}/${year} already exists`,
            )
        }

        const runNumber = this.generateRunNumber(month, year)

        const run = await this.prisma.payrollRun.create({
            data: {
                id: randomUUID(),
                companyId: ctx.companyId,
                runNumber,
                month,
                year,
                status: 'DRAFT',
                createdBy: ctx.userId,
                updatedBy: ctx.userId,
            },
        })

        this.logger.log(
            `[PayrollRun] Created run ${runNumber} for ${month}/${year}`,
        )

        const result = await this.generateEntries(run.id, ctx)
    }

    async generateEntries(runId: string,ctx: ServiceContext){
        const run = await this.prisma.payrollRun.findFirstOrThrow({
            where: {id: runId, companyId: ctx.companyId},
        })

        const employees = await this.prisma.user.findMany({
            where: {
                companyId: ctx.companyId,
                isActive: true,
                deletedAt:null,
            },
            select: {id: true, firstName: true, lastName:true, employeeId: true},
        })

        let created = 0
        let skipped = 0
        let flagged = 0

        for (const employee of employees) {
            const existing = await this.prisma.payrollEntry.findFirst({
                where: {runId, employeeId: employee.id}
            })

            if(existing) {
                skipped++
                continue
            }

            await this.calculateAndCreateEntry(run.id, employee.id, run.month, run.year, ctx)
            created++
        }

        await this.updateRunTotals(runId, ctx)

        this.logger.log(
            `[PayrollRun] Generated entries: ${created} created, ${skipped} skipped`,
        )
    }

    async calculateAndCreateEntry(
        runId: string,
        employeeId: string,
        month: number,
        year: number,
        ctx: ServiceContext,
    
    ){
        const contract = await this.prisma.employeeContract.findFirst({
            where: {
                employeeId,
                companyId: ctx.companyId,
                status: 'ACTIVE',
                deletedAt: null,
            },
            orderBy: { startDate: 'desc'}
        })

        const employee = await this.prisma.user.findFirst({
            where: {
                id: employeeId,
                companyId: ctx.companyId,
                deletedAt: null,
            },
            select: {
                bankName: true,
                bankAccountNumber: true,
            },
        })

        const attendance = await this.prisma.attendanceRecord.findFirst({
            where: {
                employeeId,
                companyId: ctx.companyId,
                month,
                year,
            },
        })

        const overtime = await this.prisma.overtimeSheet.findFirst({
            where: {
                employeeId,
                companyId: ctx.companyId,
                month,
                year,
                status: 'APPROVED'
            },
        })

        let flag: 'NONE' | 'MISSING_ATTENDANCE' | 'MISSING_CONTRACT' | 'MISSING_OVERTIME_APPROVAL' | 'ZERO_SALARY' = 'NONE'
        let flagNote: string | undefined

        if(!contract) {
            flag = 'MISSING_CONTRACT'
            flagNote = 'No active contract found'
        } else if(!attendance){
            flag = 'MISSING_ATTENDANCE'
            flagNote = 'No attendance record found for this month'
        } else if(this.toNumber(contract.basicSalary) === 0){
            flag = 'ZERO_SALARY'
            flagNote = 'Basic salary is zero on contract'
        }

        const basicSalary = this.toNumber(contract?.basicSalary)
        const transportAllowance = this.toNumber(contract?.transportationAllowance)
        const monthlyBonus = this.toNumber(contract?.monthlyBonus)
        const pensionApplicable = contract?.pensionApplicable ?? true
        const taxApplicable = contract?.taxApplicable ?? true
        const absentDays = this.toNumber(attendance?.absentDays)
        const scheduledDays = this.toNumber(attendance?.scheduledDays)
        const presentDays = this.toNumber(attendance?.presentDays)

        const leaveCoverage = attendance
            ? await getLeaveCoveredAbsences(
                  this.prisma,
                  ctx.companyId,
                  employeeId,
                  month,
                  year,
                  this.logger,
              )
            : { coveredDays: 0, coveredDates: [], leaves: [] }

        const adjustedAbsentDays = Math.max(
            0,
            absentDays - leaveCoverage.coveredDays,
        )

        const run = await this.prisma.payrollRun.findFirstOrThrow({
            where: {id: runId},
        })
        

        const overtimeHours : OvertimeHours = {
            normalHours: this.toNumber(overtime?.totalRegularHours),
            eveningHours: this.toNumber(overtime?.totalNightHours),
            sundayHours: this.toNumber(overtime?.totalWeekendHours),
            holidayHours: this.toNumber(overtime?.totalHolidayHours)
        }

        const result = this.calc.calculate({
            basicSalary,
            transportAllowance,
            monthlyBonus,
            bonusTopUp: 0,
            absentDays: adjustedAbsentDays,
            overtimeHours,
            taxableThreshold: this.toNumber(run.taxableThreshold),
            pensionApplicable,
            taxApplicable,
        })
    
        const entry = await this.prisma.payrollEntry.create({
            data: {
                id: randomUUID(),
                companyId: ctx.companyId,
                runId,
                employeeId,
                contractId: contract?.id ?? null,
                attendanceRecordId: attendance?.id ?? null,
                overtimeSheetId: overtime?.id ?? null,

                // Attendance
                scheduledDays,
                presentDays: new Decimal(presentDays),
                absentDays: new Decimal(adjustedAbsentDays),
                payrollDays: new Decimal(result.payrollDays),

                // Contract snapshot
                basicSalary: new Decimal(basicSalary),
                transportAllowance: new Decimal(transportAllowance),
                monthlyBonus: new Decimal(monthlyBonus),

                // Earned
                earnedSalary: new Decimal(result.earnedSalary),

                // OT hours
                normalOtHours: new Decimal(overtimeHours.normalHours),
                eveningOtHours: new Decimal(overtimeHours.eveningHours),
                sundayOtHours: new Decimal(overtimeHours.sundayHours),
                holidayOtHours: new Decimal(overtimeHours.holidayHours),
                
                // OT pay
                normalOtPay: new Decimal(result.normalOtPay),
                eveningOtPay: new Decimal(result.eveningOtPay),
                sundayOtPay: new Decimal(result.sundayOtPay),
                holidayOtPay: new Decimal(result.holidayOtPay),
                totalOtPay: new Decimal(result.totalOtPay),

                // Transport 
                taxableTransport: new Decimal(result.taxableTransport),
                nonTaxableTransport: new Decimal(result.nonTaxableTransport),

                // Totals
                grossIncome: new Decimal(result.grossIncome),
                taxableIncome: new Decimal(result.taxableIncome),

                // Deductions
                pensionEmployee: new Decimal(result.pensionEmployee),
                pensionEmployer: new Decimal(result.pensionEmployer),
                incomeTax: new Decimal(result.incomeTax),
                totalDeductions: new Decimal(result.totalDeductions),

                // Net
                netPay: new Decimal(result.netPay),

                // Flags
                flag,
                flagNote,

                // Bank snapshot
                bankName: employee?.bankName ?? null,
                bankAccountNumber: employee?.bankAccountNumber ?? null,

                notes:
                    leaveCoverage.coveredDays > 0
                        ? `${leaveCoverage.coveredDays} absent working day(s) covered by approved leave: ${leaveCoverage.coveredDates.join(', ')}`
                        : null,

                createdBy: ctx.userId,
                updatedBy: ctx.userId,
            },
        })

        return entry
    }

    async recalculate(runId: string,ctx: ServiceContext){
        const run = await this.prisma.payrollRun.findFirst({
            where: {id: runId, companyId: ctx.companyId, deletedAt: null},
        })

        if(!run) throw new NotFoundException('Payroll run not found')

        if(!['DRAFT', 'REVIEWED'].includes(run.status)){
            throw new BadRequestException(
                `Cannot recalculate run ${run.status} status`,
            )
        }

        await this.prisma.payrollEntry.deleteMany({
            where: {runId},
        })

        const employees = await this.prisma.user.findMany({
            where: {
                companyId: ctx.companyId,
                isActive: true,
                deletedAt: null
            }, 
            select: {id: true}, 
        })

        for (const employee  of employees) {
            await this.calculateAndCreateEntry(
                runId,
                employee.id,
                run.month,
                run.year,
                ctx,
            )
        }

        await this.updateRunTotals(runId, ctx)

        this.logger.log(`[PayrollRun] Recalculated run ${run.runNumber}`)

        return this.getRun(runId, ctx.companyId)
    }

    private async updateRunTotals(runId: string, ctx: ServiceContext){
        const entries = await this.prisma.payrollEntry.findMany({
            where: {runId},
            select: {
                grossIncome: true,
                netPay: true,
                pensionEmployee: true,
                pensionEmployer: true,
                incomeTax: true
            },
        })

        const totals = entries.reduce(
            (acc, e) => ({
                totalGross: acc.totalGross + this.toNumber(e.grossIncome),
                totalNetPay: acc.totalNetPay + this.toNumber(e.netPay),
                totalPensionEmp: acc.totalPensionEmp + this.toNumber(e.pensionEmployee),
                totalPensionEmr: acc.totalPensionEmr + this.toNumber(e.pensionEmployer),
                totalTax: acc.totalTax + this.toNumber(e.incomeTax),
            }),
            {
                totalGross: 0,
                totalNetPay: 0,
                totalPensionEmp: 0,
                totalPensionEmr: 0,
                totalTax: 0,
            },
        )

        await this.prisma.payrollRun.update({
            where: {id:runId},
            data:{
                totalEmployees: entries.length,
                totalGross: new Decimal(Math.round(totals.totalGross * 100 ) / 100),
                totalNetPay: new Decimal(Math.round(totals.totalNetPay * 100) / 100),
                totalPensionEmp: new Decimal(Math.round(totals.totalPensionEmp * 100) / 100),
                totalPensionEmr: new Decimal(Math.round(totals.totalPensionEmr * 100) / 100),
                totalTax: new Decimal(Math.round(totals.totalTax * 100) / 100),
                updatedBy: ctx.userId,
            },
        })
    }

    async updateEntry(
        entryId: string,
        dto: {
            bonusTopUp?: number
            bonusTopUpReason?: string
            notes?: string
        },
        ctx: ServiceContext,
    ){
        const entry = await this.prisma.payrollEntry.findFirst({
            where: {id: entryId},
            include: {run: true}
        })
        if (!entry) throw new NotFoundException('Payroll entry not found')
        if(entry.run.companyId !== ctx.companyId){
            throw new NotFoundException('Payroll entry not found')
        }

        if(!['DRAFT', 'REVIEWED'].includes(entry.run.status)){
            throw new BadRequestException(
                `Cannot edit entry in run status: ${entry.run.status}`,
            )
        }

        const bonusTopUp = dto.bonusTopUp ?? this.toNumber(entry.bonusTopUp)

        const result = this.calc.calculate({
            basicSalary: this.toNumber(entry.basicSalary),
            transportAllowance: this.toNumber(entry.transportAllowance),
            monthlyBonus: this.toNumber(entry.monthlyBonus),
            bonusTopUp,
            absentDays: this.toNumber(entry.absentDays),
            overtimeHours: {
                normalHours: this.toNumber(entry.normalOtHours),
                eveningHours: this.toNumber(entry.eveningOtHours),
                sundayHours: this.toNumber(entry.sundayOtHours),
                holidayHours: this.toNumber(entry.holidayOtHours),
            },
            taxableThreshold: this.toNumber(entry.run.taxableThreshold)
        })

        const updated = await this.prisma.payrollEntry.update({
            where: {id: entryId},
            data: {
                bonusTopUp: new Decimal(bonusTopUp),
                bonusTopUpReason: dto.bonusTopUpReason ?? entry.bonusTopUpReason,
                notes: dto.notes ?? entry.notes,
                grossIncome: new Decimal(result.grossIncome),
                taxableIncome: new Decimal(result.taxableIncome),
                incomeTax: new Decimal(result.incomeTax),
                totalDeductions: new Decimal(result.totalDeductions),
                netPay: new Decimal(result.netPay),
                updatedBy: ctx.userId
            },
        })
        await this.updateRunTotals(entry.runId, ctx)
        return updated
    }

    async submitRun(runId: string, ctx: ServiceContext){
        const run = await this.getRun(runId, ctx.companyId)
        if(run.status !== 'DRAFT' && run.status !== 'REVIEWED'){
            throw new BadRequestException(
                `Run must be in DRAFT or REVIEWED status to submit`
            )
        }

        return this.prisma.payrollRun.update({
            where: {id: runId},
            data: {
                status: 'SUBMITTED',
                submittedAt: new Date(),
                submittedBy: ctx.userId,
                updatedBy: ctx.userId
            },
        })
    }

    async approveRun(runId: string, ctx: ServiceContext){
        const run = await this.getRun(runId, ctx.companyId)
        if(run.status !== 'SUBMITTED'){
            throw new BadRequestException(
                `Run must be in SUBMITTED status to approve`,
            )
        }

        return this.prisma.payrollRun.update({
            where: {id: runId},
            data: {
                status: 'APPROVED',
                approvedAt: new Date(),
                approvedBy: ctx.userId,
                updatedBy: ctx.userId
            },
        })
    }

    async gmApproveRun(
        runId: string,
        ctx: ServiceContext,
    ){
        const run = await this.getRun(runId, ctx.companyId)
        if (run.status !== 'APPROVED'){
            throw new BadRequestException(
                `Run must be in APPROVED status to GM approval`,
            )
        }

        return this.prisma.payrollRun.update({
            where: {id: runId},
            data: {
                status: 'GM_APPROVED',
                gmApprovedAt: new Date(),
                gmApprovedBy: ctx.userId,
                updatedBy: ctx.userId
            }
        })
    }

    async markPaid(runId: string, ctx: ServiceContext){
        const run = await this.getRun(runId, ctx.companyId)
        if(run.status == 'GM_APPROVED'){
            throw new BadRequestException(
                `Run must be GM_APPROVED before marking as paid`,
            )
        }
        return this.prisma.payrollRun.update({
            where: {id: runId},
            data: {
                status: 'PAID',
                paidAt: new Date(),
                paidBy: ctx.userId,
                updatedBy: ctx.userId
            },
        })
    }

    async cancelRun(runId: string, ctx: ServiceContext){
        const run = await this.getRun(runId, ctx.companyId)
        if(['GM_APPROVED', 'PAID'].includes(run.status)){
            throw new BadRequestException(
                    `Cannot cancel a run in ${run.status} status`
            )
        }

        return this.prisma.payrollRun.update({
            where: {id: runId},
            data: {
                status: 'CANCELLED',
                deletedAt: new Date(),
                deletedBy: ctx.userId,
                updatedBy: ctx.userId,
            },
        })
    }
}