import { Controller, Post } from "@nestjs/common";
import { InspectionRepairService } from "../../application/services/inspection-repair.service";
import { DelegatePermissionCheck } from "@/shared/permissions/delegate-permission-check.decorator";
import { ApiConsumes, ApiOperation, ApiBody } from "@nestjs/swagger";



@Controller('hr/inspection-repair')
export class InspectionRepairController {
    constructor(
        private readonly inspectionRepairService: InspectionRepairService,
    ) {}

    @Post()
    @DelegatePermissionCheck()
    @ApiOperation({ summary: 'Submit a new inspection repair request' })
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['urgency', '', 'inspectionType', 'inspectionResult', 'inspectionNotes'],
        }
    })

    submit(){

    }

    list(){

    }

    listMine(){

    }

    getOne(){

    }

    update(){

    }

    cancel(){

    }
}
