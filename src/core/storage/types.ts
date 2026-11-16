export interface StoredFile {
  text: string
  /** Версия файла. Передаётся при записи, чтобы не затереть чужое изменение. */
  sha: string
}

export interface WriteOptions {
  /** Версия, поверх которой пишем. Не указывается при создании нового файла. */
  sha?: string
  message: string
}

export interface DataStore {
  read(path: string): Promise<StoredFile | null>
  /** Возвращает новую версию файла. Бросает ConflictError, если файл изменился. */
  write(path: string, text: string, options: WriteOptions): Promise<string>
  remove(path: string, message: string): Promise<void>
  /** Имена файлов в папке (без вложенных папок). */
  list(dir: string): Promise<string[]>
  /** Двоичный файл целиком. */
  readBytes(path: string): Promise<Uint8Array<ArrayBuffer> | null>
  /** Создаёт двоичный файл. Путь должен быть новым. */
  writeBytes(path: string, bytes: Uint8Array<ArrayBuffer>, message: string): Promise<void>
}

export class ConflictError extends Error {
  constructor(path: string) {
    super(`Файл ${path} изменился, пока шло сохранение`)
    this.name = 'ConflictError'
  }
}

export class StorageError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'StorageError'
    this.status = status
  }
}
