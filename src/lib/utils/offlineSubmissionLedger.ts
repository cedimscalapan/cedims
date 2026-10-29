/** One-time removal of obsolete local duplicate history. Never used for validation. */
import { del, keys } from 'idb-keyval';

export async function clearLegacySubmissionLedger(): Promise<void> {
    const legacyKeys = (await keys()).filter(key =>
        typeof key === 'string' && (key.startsWith('ledger_slot_') || key.startsWith('ledger_hash_'))
    );
    await Promise.all(legacyKeys.map(key => del(key)));
}
