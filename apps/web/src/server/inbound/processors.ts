import "server-only"

import { statementImportProcessor } from "@/server/channels/statement-import/pipeline"

import type { InboundProcessors } from "."

/**
 * The processor of each channel. Events of a channel without one stay
 * pending and are counted as waiting. Kept apart from ./index so a channel
 * module can use the dispatcher without an import cycle.
 */
export const inboundProcessors: InboundProcessors = {
  statement_import: statementImportProcessor,
}
