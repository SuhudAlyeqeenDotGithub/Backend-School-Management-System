import mongoose from "mongoose";
const { Schema, model } = mongoose;

const orgAccountSchema = new Schema(
  {
    organisationName: { type: String, required: true },
    organisationEmail: { type: String, unique: true, required: true, index: true },
    organisationPhone: { type: String, required: true },
    organisationPassword: { type: String, required: true },
    organisationImage: { type: String },
    themes: {
      backgroundColor: { type: String, default: "#ffffff" },
      foregroundColor: { type: String, default: "#000000" }
    }
  },
  { timestamps: true }
);
orgAccountSchema.virtual("roleData", {
  ref: "Role",
  localField: "_id",
  foreignField: "organisationId"
});

orgAccountSchema.set("toObject", { virtuals: true });
orgAccountSchema.set("toJSON", { virtuals: true });

export const OrgAccount = model("OrgAccount", orgAccountSchema);

const userAccountSchema = new Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "OrgAccount", required: true },
    userStaffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    userName: { type: String, required: true },
    userEmail: { type: String, unique: true, required: true, index: true },
    userPassword: { type: String, required: true },
    themes: {
      backgroundColor: { type: String, default: "#ffffff" },
      textColor: { type: String, default: "#000000" },
      buttonColor: { type: String, default: "#ffffff" },
      buttonTextColor: { type: String, default: "#000000" }
    }
  },
  { timestamps: true }
);
export const UserAccount = model("UserAccount", userAccountSchema);
