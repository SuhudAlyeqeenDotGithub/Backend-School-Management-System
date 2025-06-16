import jwt from "jsonwebtoken";

export const throwError = (message: string, statusCode: number) => {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  throw error;
};

export const generateSearchText = (fields: any[]) => {
  return fields.join("|");
};

export const generateAccessToken = (accountData: any) => {
  return jwt.sign(accountData, process.env.JWT_ACCESS_TOKEN_SECRET_KEY as string, {
    expiresIn: "1d"
  });
};

export const generateRefreshToken = (accountData: any) => {
  return jwt.sign(accountData, process.env.JWT_REFRESH_TOKEN_SECRET_KEY as string, {
    expiresIn: "30d"
  });
};
