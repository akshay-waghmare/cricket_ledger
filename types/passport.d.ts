declare module 'passport' {
  import { Request, Response, NextFunction } from 'express';
  
  namespace passport {
    function authenticate(strategy: string, options?: any): (req: Request, res: Response, next: NextFunction) => any;
    function initialize(): (req: Request, res: Response, next: NextFunction) => void;
    function session(): (req: Request, res: Response, next: NextFunction) => void;
    function use(strategy: any): void;
    function serializeUser(fn: (user: any, done: (err: any, id?: any) => void) => void): void;
    function deserializeUser(fn: (id: any, done: (err: any, user?: any) => void) => void): void;
  }
  
  export = passport;
}
