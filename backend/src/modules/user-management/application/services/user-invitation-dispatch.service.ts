import { Injectable, Logger } from '@nestjs/common';
import { UserProvisioningService, ProvisionedUser } from './user-provisioning.service';

const INVITATION_CONCURRENCY = 5;

@Injectable()
export class UserInvitationDispatchService {
  private readonly logger = new Logger(UserInvitationDispatchService.name);

  constructor(
    private readonly userProvisioningService: UserProvisioningService,
  ) {}

  /**
   * Sends activation invites for imported users with bounded concurrency.
   */
  async dispatchInvitations(users: ProvisionedUser[]): Promise<{
    sent: number;
    failed: number;
  }> {
    let sent = 0;
    let failed = 0;

    for (let index = 0; index < users.length; index += INVITATION_CONCURRENCY) {
      const batch = users.slice(index, index + INVITATION_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (user) => {
          try {
            await this.userProvisioningService.sendActivationInvite(user);
            return true;
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `Failed to send activation invite to ${user.email}: ${reason}`,
            );
            return false;
          }
        }),
      );

      for (const success of results) {
        if (success) {
          sent += 1;
        } else {
          failed += 1;
        }
      }
    }

    return { sent, failed };
  }
}
