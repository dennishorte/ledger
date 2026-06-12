/**
 * parseIssues — re-export shim.
 *
 * `parseIssueItems` was promoted to @ledger/parser in
 * 04-api-server/99-maintenance/01-ui-hook-migration (item 0).
 * This file is preserved as a re-export shim so existing import sites
 * (`import { parseIssueItems } from "@/lib/parseIssues"`) keep compiling.
 */

export { parseIssueItems } from "@ledger/parser";
