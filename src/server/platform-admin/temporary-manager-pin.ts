import "server-only";

import { randomInt } from "node:crypto";

export function generateTemporaryManagerPin() {
  return randomInt(10000, 100000).toString();
}
