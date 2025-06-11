import { Request, Response, NextFunction } from "express";

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);

  const isDevelopment = process.env.NODE_ENV === "development";

  // Send the error response to the client
  
  res.status(err.status || 500).json({
    message: err.message || "Something went wrong!",
    stack: isDevelopment ? err.stack : undefined // Show stack trace in dev mode only
  });
};

export default errorHandler;
