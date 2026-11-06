import "server-only"

import { statementImportChannel } from "./statement-import/channel"
import type { ChannelKind, PaymentChannel } from "./types"

export type {
  ChannelKind,
  InstructionAccount,
  InstructionContribution,
  NormalizedTx,
  PaymentChannel,
  PaymentInstruction,
} from "./types"
export { statementImportChannel }

/** The channels Give runs. M1 has statement_import only; payos and bank_api come in M2. */
export const paymentChannels: Partial<Record<ChannelKind, PaymentChannel>> = {
  statement_import: statementImportChannel,
}
