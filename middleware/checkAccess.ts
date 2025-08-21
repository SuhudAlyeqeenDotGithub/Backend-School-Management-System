import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
          const error = new Error("Invalid token");
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
          const error = new Error("Invalid token");
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

export { accessTokenChecker, refreshTokenChecker };
