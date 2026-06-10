export class LogoutCommand {
  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
  ) {}
}
