import type { db } from "@/lib/db";

/**
 * A client that can run queries but not open a transaction of its own — either
 * a `$transaction` handle or the root client.
 *
 * Engines take this rather than importing `db` directly so that an audit entry,
 * a notification and the mutation they describe all commit together.
 */
export type TxClient = Omit<
  typeof db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
