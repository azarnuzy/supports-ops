import { toolEncryptionConfig } from "../../config";
import { decryptToolSecret } from "./secrets";

/** Secrets cross the decryption boundary only when a Tool is about to execute. */
export function decryptExecutionSecret(value: string) {
  return decryptToolSecret(value, toolEncryptionConfig.masterKey);
}
