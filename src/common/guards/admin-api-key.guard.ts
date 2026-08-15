import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const configured = this.config.get<string>('ADMIN_API_KEY');
    const supplied = context.switchToHttp().getRequest<Request>().header('x-admin-key');
    if (!configured || supplied !== configured) throw new UnauthorizedException('Invalid admin API key');
    return true;
  }
}
