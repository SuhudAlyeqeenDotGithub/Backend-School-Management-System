import { Request, Response, NextFunction } from "express";
import { billOrganisation, registerBillings } from "../utils/billingFunctions.ts";
import { getObjectSize } from "../utils/utilsFunctions.ts";

const recordComputeSeconds = async (req: Request, start: [number, number], organisationId: string) => {
  const [seconds, nanoseconds] = process.hrtime(start);
  const elapsedTime = seconds + 1 + nanoseconds / 1e9;

  registerBillings(req, [{ field: "renderComputeSeconds", value: elapsedTime }]);
  await billOrganisation(organisationId, req.billings);
};

export const trackComputeSeconds = (req: Request, res: Response, next: NextFunction) => {
  const { organisationId } = req.userToken;
  const start = process.hrtime();
  let recorded = false;

  const recordOnce = () => {
    if (recorded) return;
    recorded = true;
    recordComputeSeconds(req, start, organisationId);
  };

  res.on("finish", () => {
    recordOnce();
  });

  res.on("close", () => {
    recordOnce();
  });

  next();
};

export const trackResponseSize = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;

  res.json = function (data: any) {
    registerBillings(req, [{ field: "renderBandwidth", value: getObjectSize(data) }]);
    return originalJson.call(this, data);
  };
  next();
};
