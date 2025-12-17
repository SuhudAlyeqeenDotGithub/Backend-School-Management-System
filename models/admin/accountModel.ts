import mongoose from "mongoose";
const { Schema, model } = mongoose;

const accountSchema = new Schema(
  {
    accountType: { type: String, enum: ["Organization", "User", "Owner"], required: true },
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    organisationInitial: { type: String, required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    name: { type: String },
    email: { type: String, unique: true, required: true, index: true },
    password: { type: String, required: true },
    country: { type: String },
    phone: { type: String },
    settings: { type: Schema.Types.Mixed, default: {}, required: true },
    features: { type: [Schema.Types.Mixed], default: [], required: true },
    status: { type: String, required: true, default: "Active", enum: ["Active", "Locked"] },
    searchText: { type: String, required: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    uniqueTabAccess: { type: [mongoose.Schema.Types.Mixed], default: [] }
  },
  { timestamps: true }
);

accountSchema.pre("validate", function (next) {
  if (!this.organisationId) {
    this.organisationId = this._id;
  }
  next();
});

accountSchema.index({ email: 1, organisationId: 1 }, { unique: true });
export const Account = model("Account", accountSchema);

export const defaultSettings = {
  logActivity: true
};
