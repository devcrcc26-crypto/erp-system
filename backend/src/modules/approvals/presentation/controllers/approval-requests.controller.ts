import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApprovalsService } from '../../application/services/approvals.service';

@ApiTags('Approval Requests')
@ApiBearerAuth()
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(private readonly approvalsService: ApprovalsService) {}
}
