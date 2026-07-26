import "server-only";

import { generateStaffPin } from "../shop-admin/staff-credentials";

export function generateTemporaryManagerPin() {
  return generateStaffPin();
}
