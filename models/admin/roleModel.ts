import mongoose from "mongoose";
import { Schema, model } from "mongoose";
import { defaultTabAccess } from "../../utils/defaultVariables";

const roleSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    roleName: { type: String, required: true },
    roleDescription: { type: String },
    absoluteAdmin: { type: Boolean, default: false },
    tabAccess: {
      type: [],
      default: []
    }
  },
  { timestamps: true }
);

roleSchema.pre("save", function (next) {
  if (this.absoluteAdmin === true) {
    this.tabAccess = defaultTabAccess;
  }
  next();
});

export const Role = model("Role", roleSchema);
