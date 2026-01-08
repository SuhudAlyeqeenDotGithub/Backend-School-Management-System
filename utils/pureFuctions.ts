export const toNegative = (value: number) => {
  if (value <= 0) return value;
  return Math.abs(value) * -1;
};

export const getObjectSize = (obj: any): number => {
  if (obj == null || !obj) return 0;
  return parseFloat((Buffer.byteLength(JSON.stringify(obj), "utf8") / 1024 ** 3).toString());
};

export const getLastBillingDate = (now = new Date()) => {
  const date = new Date(now);
  date.setMonth(date.getMonth() - 1);
  return `5 ${date.toLocaleString("en-GB", { month: "long", year: "numeric" })}`;
};

export const getLastMonth = (now = new Date()) => {
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return date.toLocaleString("en-GB", { month: "long", year: "numeric" });
};
export const getNextBillingDate = (now = new Date()) => {
  const date = new Date(now);
  date.setMonth(date.getMonth() + 1);
  return `5 ${date.toLocaleString("en-GB", { month: "long", year: "numeric" })}`;
};

export const isExpired = (date: string | Date): boolean => {
  const expiry = new Date(date);
  expiry.setHours(23, 59, 59, 999);
  return expiry.getTime() < Date.now();
};

export const getCurrentMonth = (now = new Date()) => {
  const date = new Date(now);
  return `${date.toLocaleString("en-GB", { month: "long", year: "numeric" })}`;
};

// throw error function
export const throwError = (message: string, statusCode: number) => {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  throw error;
};

export const validatePassword = (password: string) => {
  if (!password) return false;
  const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>~+\-]).{8,}$/;
  return passwordStrengthRegex.test(password.trim());
};

export const validateEmail = (email: string) => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

// generateSearchTextFunction
export const generateSearchText = (fields: any[]) => {
  return fields.join("|");
};

// generateCustomId
