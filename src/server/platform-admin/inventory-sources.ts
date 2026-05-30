import "server-only";

export type InventorySourceMappingState =
  | "mapped"
  | "unmapped"
  | "not_configured"
  | "mobile_only"
  | "ambiguous";

export type InventorySourceBoundaryStatus = {
  status: "not_configured";
  boundary: "server_only";
  mappingState: InventorySourceMappingState;
  reason: string;
};

export const inventorySourceMappingStates: readonly InventorySourceMappingState[] =
  ["mapped", "unmapped", "not_configured", "mobile_only", "ambiguous"];

export function isInventorySourceMappingState(
  value: string,
): value is InventorySourceMappingState {
  return inventorySourceMappingStates.includes(
    value as InventorySourceMappingState,
  );
}

export function normalizeInventorySourceMappingState(
  value: string | null | undefined,
): InventorySourceMappingState {
  if (!value) {
    return "not_configured";
  }

  return isInventorySourceMappingState(value) ? value : "unmapped";
}

export function getInventorySourceBoundaryStatus(): InventorySourceBoundaryStatus {
  return {
    status: "not_configured",
    boundary: "server_only",
    mappingState: "not_configured",
    reason:
      "shop_inventory_sources is server-owned and read through the Platform Admin RLS boundary only.",
  };
}
