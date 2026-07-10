/**
 * @realityloom/interface — the Reality Loom Interface System.
 *
 * The native, headless UI/projection layer of Reality Loom OS. It replaces
 * cards, panels, tabs, and dashboards with world-native primitives; enforces
 * the no-overlap invariant; restricts motion to the runtime vocabulary; and
 * bridges SLI projections into contract-conforming scenes that any renderer
 * (web, native, 3D, voice) can express — and none may reinterpret.
 *
 * See REALITY_LOOM_INTERFACE_CONTRACT.md. The contract is executable:
 * validateScene enforces every rule, and the "interface" compliance suite
 * proves it stays enforced.
 */
export * from "./tokens/index.js";
export * from "./motion/index.js";
export * from "./layout/index.js";
export * from "./primitives/index.js";
export * from "./surfaces/index.js";
export {
  sceneFromProjection,
  createInterfaceRenderer,
  type SceneFromProjectionOptions,
  type SceneResult
} from "./bridge/sliBridge.js";
export {
  RL_INTERFACE_CONTRACT,
  validateScene,
  flattenPrimitives,
  flattenObjects,
  type RLScene,
  type RLContractViolation
} from "./contract.js";
