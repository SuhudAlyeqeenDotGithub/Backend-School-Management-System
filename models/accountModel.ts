import mongoose from "mongoose";
const { Schema, model } = mongoose;

const accountSchema = new Schema(
  {
    accountType: { type: String, enum: ["Organization", "User"], required: true },
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    accountName: { type: String },
    accountEmail: { type: String, unique: true, required: true, index: true },
    accountPassword: { type: String, required: true },
    accountPhone: { type: String },
    accountStatus: { type: String, required: true, default: "Active", enum: ["Active", "Inactive"] },
    searchText: { type: String, required: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    themes: {
      backgroundColor: { type: String, default: "#ffffff" },
      foregroundColor: { type: String, default: "#000000" }
    }
  },
  { timestamps: true }
);

accountSchema.pre("validate", function (next) {
  if (!this.organisationId) {
    this.organisationId = this._id; // Mongoose auto-generates _id
  }
  next();
});
export const Account = model("Account", accountSchema);
