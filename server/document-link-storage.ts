import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { protectDirectory } from './platform/storage.ts'
import type { DocumentLinkEntry } from './document-link-index.ts'

type StoredParse = { file: string; stamp: string; entry: DocumentLinkEntry }

export class DocumentLinkStorage {
  private db: DatabaseSync | undefined
  private lookup!: StatementSync
  private replace!: StatementSync
  private disabled = false

  constructor(file: string) { this.file = file }
  private readonly file: string

  private open(): DatabaseSync | undefined {
    if (this.disabled) return
    if (this.db) return this.db
    protectDirectory(path.dirname(this.file))
    this.db = new DatabaseSync(this.file)
    fs.chmodSync(this.file, 0o600)
    this.db.exec(`
      PRAGMA busy_timeout = 100;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS document_parse (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        stamp TEXT NOT NULL,
        entry TEXT NOT NULL
      );
    `)
    this.lookup = this.db.prepare('SELECT entry FROM document_parse WHERE path = ? AND stamp = ?')
    this.replace = this.db.prepare('INSERT OR REPLACE INTO document_parse (path, stamp, entry) VALUES (?, ?, ?)')
    return this.db
  }

  read(file: string, stamp: string): DocumentLinkEntry | undefined {
    try {
      if (!this.open()) return
      const row = this.lookup.get(file, stamp) as { entry: string } | undefined
      return row && JSON.parse(row.entry) as DocumentLinkEntry
    } catch {
      this.close()
    }
  }

  write(items: StoredParse[]): void {
    if (!items.length) return
    try {
      const db = this.open()
      if (!db) return
      db.exec('BEGIN IMMEDIATE')
      for (const { file, stamp, entry } of items) this.replace.run(file, stamp, JSON.stringify(entry))
      db.exec(`
        DELETE FROM document_parse WHERE id < (SELECT id FROM document_parse ORDER BY id DESC LIMIT 1 OFFSET 49999);
        COMMIT;
      `)
    } catch {
      this.close()
    }
  }

  close(): void {
    this.disabled = true
    try { this.db?.close() } catch { /* Cache failures leave Markdown available. */ }
    this.db = undefined
  }
}
