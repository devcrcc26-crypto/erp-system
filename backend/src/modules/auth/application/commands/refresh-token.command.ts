export class RefreshTokenCommand {
  constructor(
    public readonly sessionId: string,
    public readonly refreshToken: string,
    public readonly ipAddress?: string,
  ) {}
}
