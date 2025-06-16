import express from "express";
const router = express.Router();
import {
  signupOrgAccount,
  signinAccount,
  resetPasswordSendEmail,
  resetPasswordVerifyCode,
  resetPasswordNewPassword,
  signoutAccount,
  fetchAccount
} from "../controllers/accountControllers";
import { accessTokenChecker } from "../middleware/checkAccess";

router.post("/orgaccount/signup", signupOrgAccount);
router.post("/orgaccount/signin", signinAccount);
router.get("/orgaccount/signout", signoutAccount);
router.get("/orgaccount/fetchaccount", accessTokenChecker, fetchAccount);
router.post("/orgaccount/resetpassword", resetPasswordSendEmail);
router.post("/orgaccount/resetpassword/verifycode", resetPasswordVerifyCode);
router.post("/orgaccount/resetpassword/newpassword", resetPasswordNewPassword);

export default router;
