import * as fs from "node:fs";
import * as path from "node:path";
import type { DatabaseSync } from "node:sqlite";

// The SQLite file shared by every persistent state machine. It is opened on first use, so a runtime without
// node:sqlite only fails when an operation needs it, with the reason in the error.
export class StateMachineDatabase {
	private database: DatabaseSync | undefined;

	constructor(private readonly databasePath: string) {}

	get connection(): DatabaseSync {
		if (!this.database) {
			const { DatabaseSync: Database } =
				require("node:sqlite") as typeof import("node:sqlite");

			fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });

			const database = new Database(this.databasePath);

			database.exec(
				"PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;",
			);
			database.exec(`
        CREATE TABLE IF NOT EXISTS state_machine_operations (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          subject TEXT NOT NULL,
          state TEXT NOT NULL,
          data TEXT NOT NULL,
          payload BLOB,
          owner INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS state_machine_operations_kind_state ON state_machine_operations (kind, state);
      `);
			this.database = database;
		}

		return this.database;
	}

	close(): void {
		this.database?.close();
		this.database = undefined;
	}
}
