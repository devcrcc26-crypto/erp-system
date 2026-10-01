import { 
    Controller, 
    Param, 
    Body, 
    Get,
    Post,
    Patch 
} from "@nestjs/common";
import { PayrollRunService } from "../../application/services/payroll-run.service";
import { CurrentUser } from "../../../../shared/decorators/current-user.decorator";
import { CreatePayrollRunDto } from "../../application/dtos/payroll.dtos";
import {UpdatePayrollEntryDto} from "../../application/dtos/payroll.dtos";

@Controller('payroll')
export class PayrollController {

    constructor(private readonly payrollRunService: PayrollRunService){}

    @Get('runs')
    listRuns(@CurrentUser() user: any){
        return this.payrollRunService.listRuns(user.companyId)
    }

    @Get('runs/:id')
    getRun(@Param('id') id: string, @CurrentUser() user: any){
        return this.payrollRunService.getRun(id, user.companyId)
    }

    @Post('runs')
    createRun(
        @Body() dto: CreatePayrollRunDto, @CurrentUser() user: any
    ){
        return this.payrollRunService.createRun(
            dto.month, dto.year, {
                userId: user.id,
                companyId: user.companyId
            }
        )
    }

    @Post('runs/:id/generate')
    generateEntries(@Param('id') id: string, @CurrentUser() user: any){
        return this.payrollRunService.generateEntries(id, {
            userId: user.id,
            companyId: user.companyId,
        })
    }

    @Post('runs/:id/recalculate')
    recalculate(
        @Param('id') id: string, @CurrentUser() user: any
    ){
        return this.payrollRunService.recalculate(id, {
            userId: user.id,
            companyId: user.companyId,
        })
    }

    @Post('runs/:id/submit')
    submitRun(@Param('id') id: string, @CurrentUser() user: any){
        return this.payrollRunService.approveRun(id, {
            userId: user.id,
            companyId: user.companyId
        })
    }

    @Post('runs/:id/approve')
    approveRun(@Param('id') id: string, @CurrentUser() user: any){
        return this.payrollRunService.approveRun(id, {
            userId: user.id,
            companyId: user.companyId
        })
    }

    @Post('runs/:id/gm-approve')
    getApproveRun(@Param('id') id: string, @CurrentUser() user: any){
        return this.payrollRunService.gmApproveRun(id, {
            userId: user.id,
            companyId: user.companyId
        })
    }

    @Post('runs/:id/mark-paid')
    markPaid(@Param('id') id: string, @CurrentUser() user: any){
        return this.payrollRunService.markPaid(id, {
            userId: user.id,
            companyId: user.companyId
        })
    }

    @Post('runs/:id/cancel')
    cancelRun(@Param('id') id: string, @CurrentUser() user: any){
        return this.payrollRunService.cancelRun(id, {
            userId: user.id,
            companyId: user.companyId,
        })
    }

    @Patch('entries/:id')
    updateEntry(
        @Param('id') id: string, 
        @Body() dto: UpdatePayrollEntryDto, 
        @CurrentUser() user: any
    ){
        return this.payrollRunService.updateEntry(id, dto, {
            userId: user.id,
            companyId: user.companyId,
        })
    }
}

