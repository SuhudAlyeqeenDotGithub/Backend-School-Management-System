import "express";

declare global {
  namespace Express {
    interface Request {
      userToken: {
        accountId: any;
        organisationId: any;
      };
      billings: { field: string; value: number }[];
    }
  }
}

export {};
