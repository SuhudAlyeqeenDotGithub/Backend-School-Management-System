import { Request, Response, NextFunction } from "express";

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const isDevelopment = process.env.NODE_ENV === "development";

  if (isDevelopment) {
    console.error("Stack trace:", err.stack);
  }

  if (err.name === "MongoServerError" && err.code === 11000) {
    const field = Object.keys(err.keyValue).join(" and ");
    res.status(400).json({
      message: `${field} combination already exist. Please ensure you have not entered the same exact data/combination as before.`
    });
    return;
  }
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((val: any) => val.message);
    res.status(400).json({
      message: messages
    });
    return;
  }

  // Cast error
  if (err.name === "CastError") {
    res.status(400).json({
      message: `Invalid value for ${err.path}: ${err.value}`
    });
    return;
  }

  // Send the error response to the client

  res.status(err.status || 500).json({
    message: err.message || "Something went wrong!",
    stack: isDevelopment ? err.stack : undefined // Show stack trace in dev mode only
  });
};

export default errorHandler;
