import mongoose from "mongoose";
const { Schema, model } = mongoose;

const accountSchema = new Schema(
  {
    accountType: { type: String, enum: ["Organization", "User", "Owner"], required: true },
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    organisationInitial: { type: String, required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    accountName: { type: String },
    accountEmail: { type: String, unique: true, required: true, index: true },
    accountPassword: { type: String, required: true },
    country: { required: true, type: String },
    accountPhone: { type: String },
    settings: { type: Schema.Types.Mixed, default: {}, required: true },
    features: { type: [Schema.Types.Mixed], default: [], required: true },
    accountStatus: { type: String, required: true, default: "Active", enum: ["Active", "Locked"] },
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

accountSchema.index({ accountEmail: 1, organisationId: 1 }, { unique: true });
export const Account = model("Account", accountSchema);

export const defaultSettings = {
  logActivity: true
};
