import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Subscription } from "../models/admin/subscription.ts";
import { getLastMonth, isExpired, sendEmailToOwner } from "../utils/utilsFunctions.ts";
import { Billing } from "../models/admin/billingModel.ts";
import { getOwnerMongoId } from "../utils/envVariableGetters.ts";

// Extend Express Request interface to include 'user'

const accessTokenChecker = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      const error = new Error("No Access Token Found");
      (error as any).status = 401;
      return next(error);
    }

    jwt.verify(
      token,
      process.env.JWT_ACCESS_TOKEN_SECRET_KEY as string,
      (err: jwt.VerifyErrors | null, decoded: any) => {
        if (err) {
          const error = new Error("Invalid Access token");
          (error as any).status = 403;
          return next(error);
        }

        req.userToken = decoded;
        next();
      }
    );
  } catch (err) {
    next(err);
  }
};

const refreshTokenChecker = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      const error = new Error("No Refresh Token Found");
      (error as any).status = 401;
      return next(error);
    }

    jwt.verify(
      token,
      process.env.JWT_REFRESH_TOKEN_SECRET_KEY as string,
      (err: jwt.VerifyErrors | null, decoded: any) => {
        if (err) {
          const error = new Error("Invalid Refresh token");
          (error as any).status = 403;
          return next(error);
        }

        req.userToken = decoded;

        next();
      }
    );
  } catch (err) {
    next(err);
  }
};

const checkSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organisationId } = req.userToken;
    if (organisationId === getOwnerMongoId()) return next();

    const subscription = await Subscription.findOne({ organisationId }).lean();

    if (!subscription) {
      sendEmailToOwner(
        "Access Denied",
        `Organisation with the ID: ${organisationId} tried to access premium but has no subscription`
      );
      const error = new Error("No Subscription Found");
      (error as any).status = 401;
      return next(error);
    }

    const premiumHasEnd = subscription.premiumEndDate;
    const subscriptionType = subscription.subscriptionType;

    if (premiumHasEnd) {
      sendEmailToOwner(
        "Access Denied",
        `Organisation with the ID: ${organisationId} tried to access premium but their subscription has expired`
      );
      const error = new Error("Your subscription has expired");
      (error as any).status = 401;
      return next(error);
    }

    if (subscriptionType === "Freemium" && isExpired(subscription.freemiumEndDate)) {
      sendEmailToOwner(
        "Access Denied",
        `Organisation with the ID: ${organisationId} tried to access premium but their freemium subscription has expired`
      );
      const error = new Error("Your freemium subscription has expired - visit billing/subscriptions to renew");
      (error as any).status = 401;
      return next(error);
    }

    if (subscriptionType === "Premium") {
      const date = new Date();
      date.setMonth(date.getMonth() - 1);
      const wasOnFreemiumLastMonth =
        date.getMonth() === subscription.freemiumEndDate.getMonth() &&
        date.getFullYear() === subscription.freemiumEndDate.getFullYear();

      if (wasOnFreemiumLastMonth) {
        next();
      }

      const lastMonthBill = await Billing.findOne({ organisationId, billingMonth: getLastMonth() });
      if (!lastMonthBill) {
        sendEmailToOwner(
          "Access Denied",
          `Organisation with the ID: ${organisationId} tried to access premium but we could not find last month billing for them`
        );
        const error = new Error("No Billing Found for last month");
        (error as any).status = 401;
        return next(error);
      }

      if (["Unpaid", "Pending", "Failed"].includes(lastMonthBill.paymentStatus)) {
        sendEmailToOwner(
          "Access Denied",
          `Organisation with the ID: ${organisationId} tried to access premium and has not paid last month billing`
        );
        const error = new Error("Last month billing has not been paid - visit billing page to resolve this issue");
        (error as any).status = 401;
        return next(error);
      }

      return next();
    }
  } catch (err) {
    return next(err);
  }
};

export { accessTokenChecker, refreshTokenChecker, checkSubscription };
