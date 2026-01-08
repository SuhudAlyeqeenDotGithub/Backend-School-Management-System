import express from "express";
const router = express.Router();
import {
  signupOrgAccount,
  signinAccount,
  resetPasswordSendEmail,
  resetPasswordVerifyCode,
  resetPasswordNewPassword,
  signoutAccount,
  refreshAccessToken,
  verifyAccount,
  getEmailVerificationCode,
  fetchSpecificAccount
} from "../controllers/accountControllers";
import { refreshTokenChecker } from "../middleware/checkAccess";

router.post("/orgaccount/verifyaccount", getEmailVerificationCode);
router.post("/orgaccount/verifysignupcode", verifyAccount);
router.post("/orgaccount/signup", signupOrgAccount);
router.post("/orgaccount/signin", signinAccount);
router.get("/orgaccount/signout", signoutAccount);
router.post("/orgaccount/refreshaccesstoken", refreshTokenChecker, refreshAccessToken);
router.post("/orgaccount/resetpassword", resetPasswordSendEmail);
router.post("/orgaccount/resetpassword/verifycode", resetPasswordVerifyCode);
router.post("/orgaccount/resetpassword/newpassword", resetPasswordNewPassword);
router.get("/orgaccount/specific-account", fetchSpecificAccount);

export default router;
