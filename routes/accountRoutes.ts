import express from "express";
const router = express.Router();
import {
  signupOrgAccount,
  signinAccount,
  resetPasswordSendEmail,
  resetPasswordVerifyCode,
  resetPasswordNewPassword
} from "../controllers/accountControllers";

router.post("/orgaccount/signup", signupOrgAccount);
router.post("/orgaccount/signin", signinAccount);
router.post("/orgaccount/resetpassword", resetPasswordSendEmail);
router.post("/orgaccount/resetpassword/verifycode", resetPasswordVerifyCode);
router.post("/orgaccount/resetpassword/newpassword", resetPasswordNewPassword);

export default router;
