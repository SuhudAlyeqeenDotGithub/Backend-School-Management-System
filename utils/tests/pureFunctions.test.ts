import {
  getCurrentMonth,
  getLastBillingDate,
  getNextBillingDate,
  getObjectSize,
  isExpired,
  toNegative
} from "../pureFuctions";

// test toNegative
describe("toNegative", () => {
  test("makes positive numbers negative", () => {
    expect(toNegative(5)).toBe(-5);
  });

  test("returns negative numbers as is", () => {
    expect(toNegative(-10)).toBe(-10);
  });

  test("returns zero as is", () => {
    expect(toNegative(0)).toBe(0);
  });
});

// test getObjectSize
describe("getObjectSize (pure)", () => {
  test("returns 0 for null or undefined", () => {
    expect(getObjectSize(null)).toBe(0);
    expect(getObjectSize(undefined)).toBe(0);
  });

  test("calculates size of simple object", () => {
    const obj = { a: 1, b: 2 };
    const size = getObjectSize(obj);

    // size should be > 0 but very small (a few bytes)
    expect(size).toBeGreaterThan(0);
    expect(typeof size).toBe("number");
  });

  test("same object returns same size", () => {
    const obj = { a: "hello" };

    expect(getObjectSize(obj)).toBe(getObjectSize(obj)); // deterministic
  });
});

// test get last billing date
describe("getLastBillingDate", () => {
  test("returns correct last billing date string", () => {
    const date = new Date("2024-06-15");
    expect(getLastBillingDate(date)).toBe("5 May 2024");
  });
});

// test get next billing date
describe("getNextBillingDate", () => {
  test("returns correct next billing date string", () => {
    const date = new Date("2024-06-15");
    expect(getNextBillingDate(date)).toBe("5 July 2024");
  });
});

// test get current month
describe("getCurrentMonth", () => {
  test("returns correct last month string", () => {
    const date = new Date("2024-05-15");
    expect(getCurrentMonth(date)).toBe("May 2024");
  });
});

// test is expired
describe("isExpired (end-of-day expiry)", () => {
  test("returns true for past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(isExpired(past)).toBe(true);
  });

  test("returns false for current date (expires end of today)", () => {
    const today = new Date();
    expect(isExpired(today)).toBe(false);
  });

  test("returns false for future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 1);
    expect(isExpired(future)).toBe(false);
  });
});


