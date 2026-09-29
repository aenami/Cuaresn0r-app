import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { accessContext } from './access-context';
import { AuthenticatedRequest } from './types/authenticated-request';

@Injectable()
export class AccessContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) return next.handle();
    return new Observable((subscriber) =>
      accessContext.run(
        {
          user: req.user,
          area:
            req.path?.startsWith('/payroll/me') ||
            req.path?.startsWith('/auth/usuarios/me')
              ? req.user.area
              : (req.areaSeleccionada ?? req.user.area),
        },
        () => {
          const subscription = next.handle().subscribe(subscriber);
          return () => subscription.unsubscribe();
        },
      ),
    );
  }
}
