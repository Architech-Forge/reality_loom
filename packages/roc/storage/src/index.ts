/**
 * @roc/storage — Storage & Persistence.
 *
 * Volume 2200 (STORE-2200.001 – STORE-2200.024). Persistence preserves
 * causality; it does not create it. Database choice must not change World
 * behavior: the reference adapter is in-memory + JSON file, but every
 * semantic guarantee is enforced by the adapter itself.
 */
export * from "./records.js";
export { ReferenceStorageAdapter, StorageViolation, type StorageBundle, type ROCStorageAdapter } from "./adapter.js";
