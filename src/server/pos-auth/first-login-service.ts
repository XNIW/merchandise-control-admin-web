import "server-only";

import {
  handlePosFirstLoginWithClient,
  type PosFirstLoginEndpointResult,
  type PosFirstLoginRequestMeta,
} from "./first-login-core";
import { createPosRuntimeRpcClient } from "./runtime-rpc-client";

export async function handlePosFirstLogin(
  input: unknown,
  meta: PosFirstLoginRequestMeta = {},
): Promise<PosFirstLoginEndpointResult> {
  return handlePosFirstLoginWithClient(
    createPosRuntimeRpcClient(),
    input,
    meta,
  );
}
