import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApprovalsService } from '../../application/services/approvals.service';

@ApiTags('Approval Categories')
@ApiBearerAuth()
@Controller('approval-categories')
export class ApprovalCategoriesController {
  constructor(private readonly approvalsService: ApprovalsService) {}
}
