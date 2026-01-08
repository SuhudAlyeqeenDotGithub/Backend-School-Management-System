import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Subscription } from "../models/admin/subscription.ts";
import { sendEmail, sendEmailToOwner } from "../utils/databaseFunctions.ts";
import { Billing } from "../models/admin/billingModel.ts";
import { getCurrentMonth, getLastBillingDate, isExpired } from "../utils/pureFuctions.ts";
import { getOwnerMongoId, getRenderBaseRate } from "../utils/envVariableGetters.ts";
import { createNewMonthBilling } from "../utils/billingFunctions.ts";
import { TotalUsage } from "../models/admin/totalusage.ts";
import { targetUsages } from "../controllers/adminControllers/billing.ts";

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
  const { organisationId } = req.userToken;
  try {
    if (organisationId === getOwnerMongoId()) return next();

    const subscription = await Subscription.findOne({ organisationId }).lean();

    if (!subscription) {
      sendEmailToOwner(
        req,
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
        req,
        "Access Denied",
        `Organisation with the ID: ${organisationId} tried to access premium but their subscription has expired`
      );
      const error = new Error("Your subscription has expired");
      (error as any).status = 401;
      return next(error);
    }

    if (subscriptionType === "Freemium" && isExpired(subscription.freemiumEndDate)) {
      sendEmailToOwner(
        req,
        "Access Denied",
        `Organisation with the ID: ${organisationId} tried to access premium but their freemium subscription has expired`
      );
      const error = new Error("Your freemium subscription has expired - visit billing/subscriptions to upgrade");
      (error as any).status = 401;
      return next(error);
    }
    if (subscriptionType === "Premium") {
      const today = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(today.getMonth() - 1);

      // Was freemium still active within the last month window?
      const wasOnFreemiumLastMonth = subscription.freemiumEndDate.getTime() >= oneMonthAgo.getTime();

      if (wasOnFreemiumLastMonth) {
        return next(); // still in grace period after freemium
      }

      // If freemium was not active last month, check billing
      const lastMonthBill = await Billing.findOne({
        organisationId,
        billingMonth: getLastBillingDate().slice(2),
        subscriptionType: "Premium"
      }).lean();

      const currentMonth = getCurrentMonth();

      if (!lastMonthBill) {
        const currentMonthBill = await Billing.findOne({
          organisationId,
          billingMonth: currentMonth,
          subscriptionType: "Premium"
        }).lean();

        if (!currentMonthBill) {
          const newMonthBill = await createNewMonthBilling(req, organisationId, currentMonth, "Premium");
          if (!newMonthBill?.newBillingDoc) {
            sendEmailToOwner(
              req,
              "Access Denied",
              `Organisation with the ID: ${organisationId} tried to access premium but we could not find their last month bill and there is no sign of their current month bill - we tried but could not create a new month billing document`
            );
            const error = new Error("Could not create current month billing document");
            (error as any).status = 401;
            return next(error);
          }
        }
      }
      if (lastMonthBill) {
        // if last month premium bill was not billed - not calculated send message to owner and calculate bill as backup
        if (lastMonthBill?.billingStatus === "Not Billed" && new Date() > new Date(lastMonthBill?.billingDate)) {
          // get total usages for last month
          const totalUsages = await TotalUsage.findOne({
            billingMonth: lastMonthBill.billingMonth
          }).lean();

          // if no total usages for last month - send message to owner
          if (!totalUsages) {
            sendEmailToOwner(
              req,
              "Potential Bug - Billing Error",
              `Organisation with the ID: ${organisationId} has not been billed for last month nor charged and today ${new Date().toUTCString()} is after the billing date ${
                lastMonthBill.billingDate
              }. We tried to calculate the bill but could not find total usages for last month.`
            );
            const error = new Error(
              "Last month billing was not billed successfully. We are working to fix this. Apologies for the inconvenience"
            );
            (error as any).status = 401;
            return next(error);
          }

          const lastMonthBillingDocs = await Billing.find({
            billingMonth: lastMonthBill.billingMonth,
            subscriptionType: "Premium"
          }).lean();

          if (!lastMonthBillingDocs) {
            sendEmailToOwner(
              req,
              "Potential Bug - Billing Error",
              `Organisation with the ID: ${organisationId} has not been billed for last month nor charged and today ${new Date().toUTCString()} is after the billing date ${
                lastMonthBill.billingDate
              }. We could not get last month billing docs.`
            );
            const error = new Error(
              "Last month billing was not billed successfully. We are working to fix this. Apologies for the inconvenience"
            );
            (error as any).status = 401;
            return next(error);
          }

          // if total usages was found - calculate last month billing and update as billed
          let totalCost = 0;

          for (const field of Object.keys(lastMonthBill)) {
            if (field in targetUsages) {
              if (field === "renderBaseCost") {
                const allotedCost = getRenderBaseRate() / lastMonthBillingDocs.length;
                (lastMonthBill as any)[field] = allotedCost;
                totalCost += allotedCost;
              } else {
                const usageValue = (lastMonthBill as any)[field].value;
                const percentageUsage =
                  (totalUsages as any)[field] === 0 ? 0 : (usageValue / (totalUsages as any)[field]) * 100;
                const targetUsageRate = targetUsages[field]();
                const costForPercentageUsage = targetUsageRate === 0 ? 0 : (percentageUsage / 100) * targetUsageRate;
                (lastMonthBill as any)[field].costInDollar = costForPercentageUsage;
                totalCost += costForPercentageUsage;
              }
            }
          }

          const featuresCost = lastMonthBill.featuresToCharge?.reduce((acc, feature) => acc + (feature.price ?? 0), 0);
          totalCost += lastMonthBill.organisationId.toString() === getOwnerMongoId() ? 0 : featuresCost;

          lastMonthBill.totalCost = totalCost;
          const { _id, ...rest } = lastMonthBill;
          const updatedBill = await Billing.findByIdAndUpdate(
            lastMonthBill._id,
            {
              ...rest,
              billingStatus: "Billed"
            },
            { new: true }
          ).lean();
          // check if the update was successful
          if (!updatedBill) {
            await sendEmailToOwner(
              req,
              "Prepare Last Bills - Error updating billing document - SuSchool Management App",
              `An error occurred while recalculating and updating billing document ID: ${lastMonthBill._id} for billing month: ${lastMonthBill.billingMonth}.`
            );
            const error = new Error(
              "Last month billing was not billed successfully. It also failed to recalculated - We are working to fix this. Apologies for the inconvenience"
            );
            (error as any).status = 401;
            return next(error);
          }
          const error = new Error(
            "Last month billing was not billed successfully. It has now been calculated - please visit billing page to make payments"
          );
          (error as any).status = 401;
          return next(error);
        }

        // if last month was billed but not paid - payment or charging issue

        if (
          ["Unpaid", "Pending", "Failed"].includes(lastMonthBill.paymentStatus) &&
          lastMonthBill.billingStatus === "Billed"
        ) {
          sendEmailToOwner(
            req,
            "Access Denied",
            `Organisation with the ID: ${organisationId} tried to access premium and has not paid last month billing`
          );
          const error = new Error("Last month billing has not been paid - visit billing page to resolve this issue");
          (error as any).status = 401;
          return next(error);
        }
      }

      return next();
    }
  } catch (err) {
    return next(err);
  }
};

export { accessTokenChecker, refreshTokenChecker, checkSubscription };
