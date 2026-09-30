import { Injectable } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";


export interface OvertimeHours {
    normalHours: number
    eveningHours: number
    sundayHours: number
    holidayHours: number
}

export interface PayrollCalculationInput {
    basicSalary: number
    transportAllowance: number
    monthlyBonus: number
    bonusTopUp: number
    absentDays: number
    overtimeHours: OvertimeHours
    taxableThreshold: number // transport threshold, default 2200
}


export interface PayrollCalculationResult {
    // Attendance
    payrollDays: number
    earnedSalary: number

    // Overtime Pay
    normalOtPay: number
    eveningOtPay: number
    sundayOtPay: number
    holidayOtPay: number
    totalOtPay: number


    // Transport split
    taxableTransport: number
    nonTaxableTransport: number

    // Totals
    grossIncome: number
    taxableIncome: number

    // Deductions
    pensionEmployee: number
    pensionEmployer: number
    incomeTax: number
    totalDeductions: number

    // Net
    netPay: number

}

@Injectable()
export class PayrollCalculationService {

    // Income tax calculation - progressive table
    calculateIncomeTax(taxableIncome: number): number {
        if (taxableIncome <= 2000) return 0
        if (taxableIncome <= 4000) return taxableIncome * 0.15 - 300
        if (taxableIncome <= 7000) return taxableIncome * 0.20 - 500
        if (taxableIncome <= 10000) return taxableIncome * 0.25 - 850
        if (taxableIncome <= 14000) return taxableIncome * 0.30 - 1350
        return taxableIncome * 0.35 - 2050
    }

    //  Main calculation returns all computed fields 
    calculate(input: PayrollCalculationInput): PayrollCalculationResult{

        const {
            basicSalary,
            transportAllowance,
            monthlyBonus,
            bonusTopUp,
            absentDays,
            overtimeHours,
            taxableThreshold,
        } = input

        const payrollDays = this.round(30 - absentDays)
        const earnedSalary = this.round(basicSalary / 30 * payrollDays)

        const hourlyBase = earnedSalary / 192

        const normalOtPay = this.round(hourlyBase * overtimeHours.normalHours * 1.5)
        const eveningOtPay = this.round(hourlyBase * overtimeHours.eveningHours * 1.75)
        const sundayOtPay = this.round(hourlyBase * overtimeHours.sundayHours  * 2.00)
        const holidayHourlyBase = earnedSalary / 196
        const holidayOtPay = this.round(holidayHourlyBase * overtimeHours.holidayHours * 2.50)
        const totalOtPay = this.round(normalOtPay + eveningOtPay + sundayOtPay + holidayOtPay)


        const taxableTransport = this.round(Math.max(0, transportAllowance - taxableThreshold))
        const nonTaxableTransport = this.round(Math.min(transportAllowance, taxableThreshold))

        const totalBonus = this.round(monthlyBonus + bonusTopUp)
        const grossIncome = this.round(earnedSalary + totalOtPay + totalBonus + transportAllowance)

        const taxableIncome = this.round(earnedSalary + totalOtPay + totalBonus + taxableTransport)


        const pensionEmployee = this.round(basicSalary * 0.07)
        const pensionEmployer = this.round(basicSalary * 0.11)
        const incomeTax = this.round(this.calculateIncomeTax(taxableIncome))
        const totalDeductions = this.round(pensionEmployee + incomeTax)

        const netPay = this.round(grossIncome - totalDeductions)



        return {
            payrollDays,
            earnedSalary,
            normalOtPay,
            eveningOtPay,
            sundayOtPay,
            holidayOtPay,
            totalOtPay,
            taxableTransport,
            nonTaxableTransport,
            grossIncome,
            taxableIncome,
            pensionEmployee,
            pensionEmployer,
            incomeTax,
            totalDeductions,
            netPay,
        }
    }

    private round(value: number): number {
        return Math.round(value * 100) / 100
    }

    toNumber(value: Decimal | null | undefined): number{
        if(value == null) return 0
        return Number(value)
    }
}