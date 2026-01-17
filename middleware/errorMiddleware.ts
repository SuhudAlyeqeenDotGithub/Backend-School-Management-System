import { Request, Response, NextFunction } from "express";
import { ErrorLogger } from "../models/admin/errorLogger";
import { inferLevel, inferModelFromRoute } from "../utils/pureFuctions";

const errorHandler = async (err: any, req: Request, res: Response, next: NextFunction) => {
  const { accountId, organisationId } = req.userToken;
  const isDevelopment = process.env.NODE_ENV === "development";

  // Get basic info
  const status = err.statusCode || err.status || 500;
  const message = err.message || "Something went wrong!";
  const route = req.originalUrl;
  const model = err.model || inferModelFromRoute(route);
  const level = inferLevel(status) || "Unknown";

  // --- LOG EVERY ERROR ---
  try {
    await ErrorLogger.create({
      organisationId,
      status,
      name: err.name,
      message,
      route,
      model,
      level,
      userId: accountId
    });
  } catch (loggingError) {
    if (isDevelopment) console.error("Error logging failed:", loggingError);
  }

  // --- THEN RESPOND TO CLIENT ---
  if (isDevelopment) console.error("Stack trace:", err.stack);

  // Mongo duplicate errors
  if (
    (err.name === "MongoServerError" && err.code === 11000) ||
    ((err.name === "MongoBulkWriteError" || err.name === "BulkWriteError") && err.code === 11000)
  ) {
    const field = err.keyValue ? Object.keys(err.keyValue).join(" and ") : "this combination";
    res.status(400).json({
      message: `Duplicate found: ${field} already exists.`
    });
    return;
  }

  // Validation errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((val: any) => val.message);
    res.status(400).json({ message: messages });
    return;
  }

  // Cast error
  if (err.name === "CastError") {
    res.status(400).json({ message: `Invalid value for ${err.path}: ${err.value}` });
    return;
  }

  // Fallback for everything else
  res.status(status).json({
    message,
    stack: isDevelopment ? err.stack : undefined
  });
};

export default errorHandler;
